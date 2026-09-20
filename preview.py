"""Start the temporary local preview with its own demo database."""
import os
import runpy
from pathlib import Path
os.environ['GP_PREVIEW_MODE'] = '1'
os.environ['GP_PORT'] = '4175'
os.environ['GP_ORIGIN'] = 'http://127.0.0.1:4175'
runpy.run_path(str(Path(__file__).with_name('server.py')), run_name='__main__')
