import re, sys, os
d = sys.argv[1]; out = sys.argv[2]
html = open(os.path.join(d, 'index.html')).read()
def js(m):
    src = m.group(1); code = open(os.path.join(d, src)).read().replace('</script', '<\\/script')
    return '<script type="module">' + code + '</script>'
html = re.sub(r'<script type="module" crossorigin src="\./([^"]+)"></script>', js, html)
def css(m):
    return '<style>' + open(os.path.join(d, m.group(1))).read() + '</style>'
html = re.sub(r'<link rel="stylesheet" crossorigin href="\./([^"]+)">', css, html)
left = re.findall(r'(?:src|href)="\./assets/[^"]+"', html)
open(out, 'w').write(html)
print('bytes', len(html), 'unresolved', left)
