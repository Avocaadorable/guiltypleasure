"""Add fictional people and wishes to the local preview only; safe to run again."""
from pathlib import Path
from datetime import date, timedelta
import sqlite3

ROOT = Path(__file__).resolve().parent
DB = ROOT / 'private' / 'preview.sqlite'
OWNER = 'preview@example.com'
PEOPLE = [
    ('sophie','Sophie Chen',1),('oliver','Oliver Park',3),
    ('mia','Mia Wilson',5),('theo','Theo Martin',8),
    ('emma','Emma Lee',12),('leo','Leo Rivera',17),
    ('nina','Nina Patel',23),('noah','Noah Kim',31),
    ('chloe','Chloe Davis',42),('max','Max Bennett',56),
    ('lily','Lily Nguyen',70),('ethan','Ethan Brooks',89),
]
OCCASIONS = ['Birthday','New home','Graduation','Birthday','Anniversary','A little thank-you','New job','Birthday','Just because','Anniversary','Birthday','Holiday dinner']
WISHES = [
    ('A little espresso ritual','Ceramic cup, in butter yellow','$28'),
    ('Sunday flower vase','Something sculptural for fresh stems','$45'),
    ('One more good book','An art book for a slow afternoon','$38'),
    ('The everyday tote','Room for a sketchbook and everything else','$32'),
    ('Soft landing','A warm, textured throw for the sofa','$68'),
    ('Silver little things','A simple silver ring, size 6','$55'),
    ('On repeat','A favorite album on vinyl','$30'),
    ('A candle kind of evening','A warm, woody scent','$26'),
]

def seed():
    if not DB.is_file():
        raise SystemExit('Run preview.py and enter the preview first, then run seed_demo.py.')
    with sqlite3.connect(DB) as c:
        if not c.execute('SELECT 1 FROM users WHERE email=?',(OWNER,)).fetchone():
            raise SystemExit('Enter the preview first. This script only seeds the preview account.')
        today=date.today()
        for i,(slug,name,offset) in enumerate(PEOPLE):
            bid='demo-birthday-'+slug;lid='demo-list-'+slug
            birthday=today+timedelta(days=offset)
            c.execute('INSERT OR IGNORE INTO birthdays(id,owner,name,month,day,occasion,year) VALUES(?,?,?,?,?,?,?)',(bid,OWNER,name,birthday.month,birthday.day,OCCASIONS[i],None if OCCASIONS[i] in ('Birthday','Anniversary') else birthday.year))
            c.execute('INSERT OR IGNORE INTO lists VALUES(?,?,?)',(lid,'demo-'+slug+'@example.com',name))
            c.execute('INSERT OR IGNORE INTO members VALUES(?,?,?)',(lid,OWNER,'approved'))
            for j in range(3):
                title,detail,price=WISHES[(i+j)%len(WISHES)]
                c.execute('INSERT OR IGNORE INTO gifts(id,list_id,name,url,detail,price) VALUES(?,?,?,?,?,?)',('demo-gift-'+slug+'-'+str(j),lid,title,'https://example.com','Example wish · '+detail,price))
        own=c.execute('SELECT id FROM lists WHERE owner=? ORDER BY rowid LIMIT 1',(OWNER,)).fetchone()
        if own:
            for i,(name,detail,price) in enumerate(WISHES[:7]):
                c.execute('INSERT OR IGNORE INTO gifts(id,list_id,name,url,detail,price) VALUES(?,?,?,?,?,?)',('demo-my-gift-'+str(i),own[0],name,'https://example.com','Example wish · '+detail,price))
    print('Added 12 fictional people, 12 birthdays, 12 shared lists and sample wishes to the local preview.')

if __name__=='__main__':seed()
