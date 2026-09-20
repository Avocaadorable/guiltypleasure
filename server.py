"""Local guiltypleasure server. Email delivery requires SMTP environment settings."""
import hashlib, hmac, json, os, re, secrets, smtplib, sqlite3, ssl, time
from email.message import EmailMessage
from datetime import date
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parent
PREVIEW_MODE = os.environ.get('GP_PREVIEW_MODE') == '1'
DB_PATH = ROOT / 'private' / 'preview.sqlite' if PREVIEW_MODE else Path(os.environ.get('GP_DATABASE', str(ROOT / 'private' / 'guiltypleasure.sqlite')))
PORT = int(os.environ.get('GP_PORT', '4174'))
ORIGIN = os.environ.get('GP_ORIGIN', 'http://127.0.0.1:' + str(PORT))
if PREVIEW_MODE and urlsplit(ORIGIN).hostname != '127.0.0.1':
    raise RuntimeError('Preview mode requires the local loopback address.')
SESSION_COOKIE = 'gp_preview_session' if PREVIEW_MODE else 'gp_session'
SCHEMA = '''
CREATE TABLE IF NOT EXISTS birthdays(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,month INTEGER NOT NULL,day INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY, verified_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,email TEXT NOT NULL,digest TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(subject TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_subject ON rate_limits(subject,created);
CREATE TABLE IF NOT EXISTS lists(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members(list_id TEXT NOT NULL,email TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','revoked')),PRIMARY KEY(list_id,email));
CREATE TABLE IF NOT EXISTS gifts(id TEXT PRIMARY KEY,list_id TEXT NOT NULL,name TEXT NOT NULL,url TEXT NOT NULL CHECK(length(url)>0),detail TEXT NOT NULL,price TEXT NOT NULL,claimed_by TEXT,status INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS circles(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS circle_members(circle_id TEXT NOT NULL,email TEXT NOT NULL,PRIMARY KEY(circle_id,email));
CREATE TABLE IF NOT EXISTS list_circles(list_id TEXT NOT NULL,circle_id TEXT NOT NULL,PRIMARY KEY(list_id,circle_id));
'''

def db():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    return c

def initialize():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with db() as c:
        c.executescript(SCHEMA)
        columns={row[1] for row in c.execute('PRAGMA table_info(birthdays)')}
        if 'occasion' not in columns:
            c.execute("ALTER TABLE birthdays ADD COLUMN occasion TEXT NOT NULL DEFAULT 'Birthday'")
        if 'year' not in columns:
            c.execute('ALTER TABLE birthdays ADD COLUMN year INTEGER')
    DB_PATH.chmod(0o600)

def digest(s): return hashlib.sha256(s.encode()).hexdigest()
def uid(): return secrets.token_urlsafe(24)
def email(value):
    value = str(value or '').strip().lower()
    if len(value)>254 or not re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}",value):
        raise Problem(400,'Please enter a valid email address.')
    return value

def mail_ready(): return all(os.environ.get(k) for k in ('GP_SMTP_HOST','GP_SMTP_USER','GP_SMTP_PASSWORD','GP_SMTP_FROM'))
def send_code(recipient, code):
    if not mail_ready(): raise Problem(503,'Email verification is not connected yet. Your lists stay locked.')
    msg=EmailMessage()
    msg['From']=os.environ['GP_SMTP_FROM']; msg['To']=recipient
    msg['Subject']='Your guiltypleasure sign-in code'
    msg.set_content('Your sign-in code is '+code+'. It expires in 10 minutes.\n\nOnly enter it on guiltypleasure. If you did not request this, ignore this email.')
    port=int(os.environ.get('GP_SMTP_PORT','465'))
    context=ssl.create_default_context()
    cls=smtplib.SMTP_SSL if port==465 else smtplib.SMTP
    opts={'context':context} if port==465 else {}
    with cls(os.environ['GP_SMTP_HOST'],port,timeout=15,**opts) as smtp:
        if port!=465: smtp.starttls(context=context)
        smtp.login(os.environ['GP_SMTP_USER'],os.environ['GP_SMTP_PASSWORD'])
        smtp.send_message(msg)

class Problem(Exception):
    def __init__(self,status,message): self.status=status; self.message=message

def get_list(c, lid, who, owner=False):
    row=c.execute('SELECT * FROM lists WHERE id=?',(lid,)).fetchone()
    if row and row['owner']==who: return row
    if row and not owner:
        if c.execute("SELECT 1 FROM members WHERE list_id=? AND email=? AND status='revoked'",(lid,who)).fetchone():
            raise Problem(404,'This wishlist is private. Ask its owner for access.')
        member=c.execute("SELECT 1 FROM members WHERE list_id=? AND email=? AND status='approved'",(lid,who)).fetchone()
        group=c.execute('SELECT 1 FROM list_circles lc JOIN circle_members cm ON cm.circle_id=lc.circle_id WHERE lc.list_id=? AND cm.email=?',(lid,who)).fetchone()
        if member or group: return row
    raise Problem(404,'This wishlist is private. Ask its owner for access.')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass # No email, session, or verification codes in logs.
    def reply(self,status,obj,headers=None):
        raw=json.dumps(obj).encode()
        self.send_response(status)
        for k,v in {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',**(headers or {})}.items(): self.send_header(k,v)
        self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def cookie(self,name):
        if name == 'gp_session': name = SESSION_COOKIE
        try:
            cookies=SimpleCookie(self.headers.get('Cookie',''))
            return cookies[name].value if name in cookies else ''
        except: return ''
    def cookie_header(self,name,value,age):
        if name == 'gp_session': name = SESSION_COOKIE
        return name+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+str(age)+('; Secure' if ORIGIN.startswith('https://') else '')
    def who(self,c):
        row=c.execute('SELECT s.email FROM sessions s JOIN users u ON u.email=s.email WHERE s.digest=? AND s.expires>?',(digest(self.cookie('gp_session')),int(time.time()))).fetchone()
        if not row: raise Problem(401,'Verify your email to continue.')
        return row['email']
    def body(self):
        if self.headers.get('Origin')!=ORIGIN: raise Problem(403,'Please use the guiltypleasure page to make changes.')
        if self.headers.get('Content-Type','').split(';')[0]!='application/json': raise Problem(415,'Expected a JSON request.')
        try:
            n=int(self.headers.get('Content-Length','0'))
            if n<1 or n>16000: raise ValueError()
            data=json.loads(self.rfile.read(n))
            if not isinstance(data,dict): raise ValueError()
            return data
        except (ValueError,UnicodeError): raise Problem(400,'Invalid request.')
    def do_GET(self): self.run(False)
    def do_POST(self): self.run(True)
    def run(self,post):
        try:
            if self.headers.get('Host')!=urlsplit(ORIGIN).netloc: raise Problem(403,'Unexpected website address.')
            path=urlsplit(self.path).path
            font_types = {
                '/fonts/california.ttf': 'font/ttf',
                **{'/fonts/edigna-' + weight + '.otf': 'font/otf'
                   for weight in ('ultralight', 'light', 'regular', 'medium', 'bold')},
            }
            if not post and path in font_types:
                raw=(ROOT/'dist'/path.lstrip('/')).read_bytes()
                self.send_response(200)
                self.send_header('Content-Type',font_types[path])
                self.send_header('Cache-Control','public, max-age=86400')
                self.send_header('X-Content-Type-Options','nosniff')
                self.send_header('Content-Length',str(len(raw)))
                self.end_headers(); self.wfile.write(raw); return
            if not post and path in ('/','/index.html','/app.js'):
                file=ROOT/'dist'/('app.js' if path=='/app.js' else 'index.html')
                raw=file.read_bytes(); self.send_response(200)
                self.send_header('Content-Type','text/javascript; charset=utf-8' if path=='/app.js' else 'text/html; charset=utf-8')
                self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff')
                self.send_header('Referrer-Policy','no-referrer')
                self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'")
                self.send_header('Content-Length',str(len(raw))); self.end_headers(); self.wfile.write(raw); return
            data=self.body() if post else {}
            with db() as c:
                if path=='/api/session' and not post:
                    try: who=self.who(c)
                    except Problem: who=None
                    return self.reply(200,{'email':who,'emailConfigured':mail_ready(),'previewMode':PREVIEW_MODE})
                if path=='/api/auth/preview' and post:
                    if not PREVIEW_MODE: raise Problem(404,'Page not found.')
                    address='preview@example.com'; now=int(time.time())
                    c.execute('INSERT OR IGNORE INTO users VALUES(?,?)',(address,now))
                    c.execute('INSERT OR IGNORE INTO lists VALUES(?,?,?)',('preview-wishlist',address,'My little wishlist'))
                    c.execute('DELETE FROM sessions WHERE digest=? OR expires<=?',(digest(self.cookie('gp_session')),now))
                    token=uid(); c.execute('INSERT INTO sessions VALUES(?,?,?)',(digest(token),address,now+604800)); c.commit()
                    return self.reply(200,{'email':address},{'Set-Cookie':self.cookie_header('gp_session',token,604800)})
                if path=='/api/auth/start' and post:
                    address=email(data.get('email'))
                    if not mail_ready(): raise Problem(503,'Email verification is not connected yet. Your lists stay locked.')
                    now=int(time.time()); subjects=['email:'+address,'ip:'+self.client_address[0]]
                    c.execute('BEGIN IMMEDIATE')
                    c.execute('DELETE FROM rate_limits WHERE created<?',(now-3600,))
                    for sub in subjects:
                        limit=3 if sub.startswith('email:') else 15
                        if c.execute('SELECT COUNT(*) FROM rate_limits WHERE subject=? AND created>?',(sub,now-600)).fetchone()[0]>=limit:
                            raise Problem(429,'A few too many codes. Please try again in 10 minutes.')
                    c.executemany('INSERT INTO rate_limits VALUES(?,?)',[(sub,now) for sub in subjects])
                    challenge=uid(); code=str(secrets.randbelow(100000000)).zfill(8)
                    c.execute('DELETE FROM challenges WHERE email=? OR expires<?',(address,now))
                    c.execute('INSERT INTO challenges(id,email,digest,expires) VALUES(?,?,?,?)',(challenge,address,digest(challenge+code),now+600)); c.commit()
                    try: send_code(address,code)
                    except Exception:
                        c.execute('DELETE FROM challenges WHERE id=?',(challenge,)); c.commit()
                        raise Problem(503,'We could not send the code. Please try again later.')
                    return self.reply(200,{'sent':True},{'Set-Cookie':self.cookie_header('gp_challenge',challenge,600)})
                if path=='/api/auth/verify' and post:
                    code=str(data.get('code','')); challenge=self.cookie('gp_challenge'); now=int(time.time())
                    c.execute('BEGIN IMMEDIATE')
                    row=c.execute('SELECT * FROM challenges WHERE id=?',(challenge,)).fetchone()
                    if not row or row['expires']<=now or row['attempts']>=5: raise Problem(400,'That code expired. Request a new one.')
                    if not re.fullmatch('[0-9]{8}',code) or not hmac.compare_digest(row['digest'],digest(challenge+code)):
                        c.execute('UPDATE challenges SET attempts=attempts+1 WHERE id=?',(challenge,)); c.commit()
                        raise Problem(400,'That code does not match. Please check your email.')
                    c.execute('DELETE FROM challenges WHERE id=?',(challenge,))
                    c.execute('INSERT OR IGNORE INTO users VALUES(?,?)',(row['email'],now))
                    c.execute('DELETE FROM sessions WHERE digest=? OR expires<=?',(digest(self.cookie('gp_session')),now))
                    token=uid(); c.execute('INSERT INTO sessions VALUES(?,?,?)',(digest(token),row['email'],now+604800)); c.commit()
                    return self.reply(200,{'email':row['email']},{'Set-Cookie':self.cookie_header('gp_session',token,604800)})
                who=self.who(c)
                if path=='/api/auth/logout' and post:
                    c.execute('DELETE FROM sessions WHERE digest=?',(digest(self.cookie('gp_session')),))
                    return self.reply(200,{'ok':True},{'Set-Cookie':self.cookie_header('gp_session','',0)})
                if path=='/api/birthdays':
                    if post:
                        bid=str(data.get('id',''))
                        if bid and not c.execute('SELECT 1 FROM birthdays WHERE id=? AND owner=?',(bid,who)).fetchone():
                            raise Problem(404,'Date not found.')
                        if data.get('remove') is True:
                            if not bid: raise Problem(400,'Choose a date.')
                            c.execute('DELETE FROM birthdays WHERE id=? AND owner=?',(bid,who))
                        else:
                            name=str(data.get('name','')).strip()
                            month=data.get('month'); day=data.get('day')
                            occasion=str(data.get('occasion','Birthday')).strip()
                            year=data.get('year')
                            if not occasion or len(occasion)>60: raise Problem(400,'Add an occasion (up to 60 characters).')
                            if not name or len(name)>60: raise Problem(400,'Add a name (up to 60 characters).')
                            try:
                                if type(month)!=int or type(day)!=int: raise ValueError()
                                if year is not None and (type(year)!=int or not 2000<=year<=9999): raise ValueError()
                                date(year if year is not None else 2000,month,day)
                            except (ValueError,TypeError): raise Problem(400,'Choose a valid date.')
                            if bid:
                                c.execute('UPDATE birthdays SET name=?,month=?,day=?,occasion=?,year=? WHERE id=? AND owner=?',(name,month,day,occasion,year,bid,who))
                            else:
                                c.execute('INSERT INTO birthdays(id,owner,name,month,day,occasion,year) VALUES(?,?,?,?,?,?,?)',(uid(),who,name,month,day,occasion,year))
                    rows=c.execute('SELECT id,name,month,day,occasion,year FROM birthdays WHERE owner=? ORDER BY month,day,name',(who,)).fetchall()
                    return self.reply(200,{'birthdays':[dict(r) for r in rows]})
                if path=='/api/lists':
                    if post:
                        name=str(data.get('name','')).strip()
                        if not name or len(name)>60: raise Problem(400,'Give your wishlist a name (up to 60 characters).')
                        lid=uid(); c.execute('INSERT INTO lists VALUES(?,?,?)',(lid,who,name))
                        return self.reply(201,{'id':lid})
                    rows=c.execute("SELECT DISTINCT l.* FROM lists l LEFT JOIN members m ON m.list_id=l.id AND m.email=? AND m.status='approved' LEFT JOIN list_circles lc ON lc.list_id=l.id LEFT JOIN circle_members cm ON cm.circle_id=lc.circle_id AND cm.email=? WHERE l.owner=? OR ((m.email IS NOT NULL OR cm.email IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM members denied WHERE denied.list_id=l.id AND denied.email=? AND denied.status='revoked')) ORDER BY l.rowid",(who,who,who,who)).fetchall()
                    return self.reply(200,{'lists':[dict(r) for r in rows]})
                match=re.fullmatch(r'/api/lists/([\w-]+)(?:/(gifts|access|request|claim|groups))?',path)
                if match:
                    lid,action=match.groups()
                    if action=='request' and post:
                        exists=c.execute('SELECT owner FROM lists WHERE id=?',(lid,)).fetchone()
                        if exists and exists['owner']!=who:
                            c.execute("INSERT INTO members VALUES(?,?,'pending') ON CONFLICT(list_id,email) DO UPDATE SET status=CASE WHEN status='approved' THEN status ELSE 'pending' END",(lid,who))
                        return self.reply(200,{'ok':True})
                    listing=get_list(c,lid,who,owner=action in ('access','groups') or action=='gifts' and post)
                    if action is None and not post:
                        rows=c.execute('SELECT * FROM gifts WHERE list_id=? ORDER BY rowid DESC',(lid,)).fetchall()
                        return self.reply(200,{'list':dict(listing),'gifts':[dict(r) for r in rows]})
                    if action=='gifts' and post:
                        name=str(data.get('name','')).strip(); url=str(data.get('url','')).strip()
                        try:
                            u=urlsplit(url)
                            valid=u.scheme in ('http','https') and u.hostname and not u.username and not u.password and '.' in u.hostname and not re.search(r'[\s\x00-\x1f]',url)
                        except ValueError: valid=False
                        if not valid or len(url)>2048: raise Problem(400,'Every gift needs a valid http or https purchase link.')
                        detail=str(data.get('detail','')); price=str(data.get('price',''))
                        if not name or len(name)>90 or len(detail)>200 or len(price)>40: raise Problem(400,'Check the gift name and details.')
                        c.execute('INSERT INTO gifts(id,list_id,name,url,detail,price) VALUES(?,?,?,?,?,?)',(uid(),lid,name,url,detail,price))
                        return self.reply(201,{'ok':True})
                    if action=='claim' and post:
                        gift=str(data.get('id','')); status=data.get('status')
                        if type(status)!=int or status not in (0,1,2): raise Problem(400,'Choose a valid gift status.')
                        c.execute('BEGIN IMMEDIATE')
                        # Recheck access inside the transaction to honor concurrent revocation.
                        get_list(c,lid,who)
                        row=c.execute('SELECT * FROM gifts WHERE id=? AND list_id=?',(gift,lid)).fetchone()
                        if not row: raise Problem(404,'Gift not found.')
                        if row['claimed_by'] and row['claimed_by']!=who: raise Problem(409,'Someone else has claimed this gift.')
                        c.execute('UPDATE gifts SET status=?,claimed_by=? WHERE id=?',(status,who if status else None,gift))
                        return self.reply(200,{'ok':True})
                    if action=='access':
                        if post:
                            address=email(data.get('email')); status=data.get('status')
                            if status not in ('approved','revoked'): raise Problem(400,'Choose approve or revoke.')
                            if address==who: raise Problem(400,'You already own this wishlist.')
                            c.execute('INSERT INTO members VALUES(?,?,?) ON CONFLICT(list_id,email) DO UPDATE SET status=excluded.status',(lid,address,status))
                        rows=c.execute('SELECT m.email,m.status,u.verified_at FROM members m LEFT JOIN users u ON u.email=m.email WHERE list_id=?',(lid,)).fetchall()
                        circles=c.execute('SELECT c.id,c.name FROM circles c JOIN list_circles lc ON lc.circle_id=c.id WHERE lc.list_id=?',(lid,)).fetchall()
                        return self.reply(200,{'members':[dict(r) for r in rows],'groups':[dict(r) for r in circles]})
                    if action=='groups' and post:
                        gid=str(data.get('id',''))
                        if not c.execute('SELECT 1 FROM circles WHERE id=? AND owner=?',(gid,who)).fetchone(): raise Problem(404,'Group not found.')
                        if data.get('grant') is True: c.execute('INSERT OR IGNORE INTO list_circles VALUES(?,?)',(lid,gid))
                        else: c.execute('DELETE FROM list_circles WHERE list_id=? AND circle_id=?',(lid,gid))
                        return self.reply(200,{'ok':True})
                if path=='/api/groups':
                    if post:
                        name=str(data.get('name','')).strip()
                        if not name or len(name)>60: raise Problem(400,'Give the group a name.')
                        c.execute('INSERT INTO circles VALUES(?,?,?)',(uid(),who,name))
                    rows=c.execute('SELECT * FROM circles WHERE owner=?',(who,)).fetchall()
                    return self.reply(200,{'groups':[dict(r) for r in rows]})
                match=re.fullmatch(r'/api/groups/([\w-]+)',path)
                if match:
                    gid=match[1]
                    if not c.execute('SELECT 1 FROM circles WHERE id=? AND owner=?',(gid,who)).fetchone(): raise Problem(404,'Group not found.')
                    if post:
                        address=email(data.get('email'))
                        if data.get('remove') is True: c.execute('DELETE FROM circle_members WHERE circle_id=? AND email=?',(gid,address))
                        else: c.execute('INSERT OR IGNORE INTO circle_members VALUES(?,?)',(gid,address))
                    rows=c.execute('SELECT cm.email,u.verified_at FROM circle_members cm LEFT JOIN users u ON u.email=cm.email WHERE circle_id=?',(gid,)).fetchall()
                    return self.reply(200,{'members':[dict(r) for r in rows]})
                raise Problem(404,'Page not found.')
        except Problem as e: self.reply(e.status,{'error':e.message})
        except Exception: self.reply(500,{'error':'Something went wrong. Please try again.'})

if __name__=='__main__':
    initialize()
    server = ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
    print('guiltypleasure: '+ORIGIN,flush=True)
    server.serve_forever()
