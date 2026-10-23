import sys, base64, re
t = open(sys.argv[1]).read(); m = re.search(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', t)
open(sys.argv[2], 'wb').write(base64.b64decode(m.group(1)))
