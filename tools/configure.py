"""Generate an XcodeGen spec without putting any signing secrets in the project."""
import argparse, json, pathlib, re
import yaml

parser = argparse.ArgumentParser()
parser.add_argument('--mode', choices=['shared', 'portable'], default='shared')
parser.add_argument('--bundle-id', default='cn.personal.metrominutes')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+', args.bundle_id):
    raise SystemExit('Invalid bundle identifier')
root = pathlib.Path(__file__).resolve().parent.parent
spec = yaml.safe_load((root / 'project.yml').read_text(encoding='utf-8'))
spec['settings']['base']['METRO_APP_GROUP'] = 'group.' + args.bundle_id if args.mode == 'shared' else ''
for target, suffix in [('MetroMinutes', ''), ('MetroMinutesWidget', '.widget'), ('MetroMinutesTests', '.tests')]:
    spec['targets'][target]['settings']['base']['PRODUCT_BUNDLE_IDENTIFIER'] = args.bundle_id + suffix
    if args.mode == 'portable':
        spec['targets'][target].pop('entitlements', None)
(root / 'build').mkdir(exist_ok=True)
# Keep the generated spec at project root so all relative source paths are unchanged.
(root / 'project.generated.json').write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding='utf-8')
print('Prepared', args.mode, 'project for', args.bundle_id)
