"""Windows source checks only. Does not replace xcodebuild or XCTest."""
import json, pathlib, sys
import yaml
from tree_sitter import Language, Parser
import tree_sitter_swift

root = pathlib.Path(__file__).resolve().parent.parent
parser = Parser(Language(tree_sitter_swift.language()))
swift_files = list(root.rglob('*.swift'))
for file in swift_files:
    source = file.read_bytes()
    tree = parser.parse(source)
    nodes = [tree.root_node]
    while nodes:
        node = nodes.pop()
        if node.type == 'ERROR' or node.is_missing:
            raise SystemExit(f'Swift grammar error: {file}:{node.start_point}')
        nodes.extend(node.children)

for file in [root/'project.yml', root/'.github/workflows/ios.yml']:
    yaml.safe_load(file.read_text(encoding='utf-8'))
spec = yaml.safe_load((root/'project.yml').read_text(encoding='utf-8'))
for target in spec['targets'].values():
    for source in target['sources']:
        path = source if isinstance(source,str) else source['path']
        assert (root/path).exists(), path
catalog = json.loads((root/'Resources/stations.json').read_text(encoding='utf-8'))
assert len(catalog) == len({(s['lineID'],s['stationID']) for s in catalog})
assert all(all(isinstance(v,str) and v for v in s.values()) for s in catalog)
assert any(s['stationID']=='5032' and s['lineID']=='50' for s in catalog)
assert any(s['stationID']=='0403' and s['lineID']=='04' for s in catalog)
assert any(s['stationID']=='0918' and s['lineID']=='09' for s in catalog)
for file in (root/'Resources/Assets.xcassets').rglob('Contents.json'):
    value = json.loads(file.read_text(encoding='utf-8-sig'))
    for image in value.get('images',[]):
        data = (file.parent/image['filename']).read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n'
        size = int(image['size'].split('x')[0]) * int(image['scale'][0])
        assert int.from_bytes(data[16:20],'big') == size
        assert int.from_bytes(data[20:24],'big') == size
print(f'PASS: {len(swift_files)} Swift files parsed; project paths, YAML, {len(catalog)} unique station choices, icon dimensions validated.')
print('NOT RUN: Apple compiler, XCTest, simulator UI, iPhone installation and widget refresh behavior.')
