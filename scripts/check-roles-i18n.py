import json, glob, os

stats = {"total": 0, "missing_en_name": 0, "missing_en_desc": 0, "missing_en_resp": 0, "missing_en_soul": 0, "missing_zhXG_name": 0, "missing_zhXG_desc": 0, "missing_zhXG_resp": 0, "missing_zhXG_soul": 0, "empty_resp": 0}
missing_en_name_list = []
missing_en_desc_list = []
missing_en_resp_list = []
empty_resp_list = []

for dept_dir in sorted(glob.glob('src-tauri/resources/roles/*/')):
    dept = os.path.basename(dept_dir.rstrip('/'))
    for f in sorted(glob.glob(os.path.join(dept_dir, '*.json'))):
        d = json.load(open(f))
        stats["total"] += 1
        rid = d['id']

        if not d['name'].get('en', '').strip():
            stats["missing_en_name"] += 1
            missing_en_name_list.append(rid)
        if not d['description'].get('en', '').strip():
            stats["missing_en_desc"] += 1
            missing_en_desc_list.append(rid)
        if not d['responsibilities'].get('en', '').strip():
            stats["missing_en_resp"] += 1
            missing_en_resp_list.append(rid)
        if not d['soulContent'].get('en', '').strip():
            stats["missing_en_soul"] += 1

        if not d['name'].get('zh-XG', '').strip():
            stats["missing_zhXG_name"] += 1
        if not d['description'].get('zh-XG', '').strip():
            stats["missing_zhXG_desc"] += 1
        if not d['responsibilities'].get('zh-XG', '').strip():
            stats["missing_zhXG_resp"] += 1
        if not d['soulContent'].get('zh-XG', '').strip():
            stats["missing_zhXG_soul"] += 1

        has_resp = False
        for key in ['zh-CN', 'zh-XG', 'en']:
            if d['responsibilities'].get(key, '').strip():
                has_resp = True
                break
        if not has_resp:
            stats["empty_resp"] += 1
            empty_resp_list.append(rid)

print(f"Total roles: {stats['total']}")
print(f"\nMissing English (en):")
print(f"  name: {stats['missing_en_name']}")
print(f"  description: {stats['missing_en_desc']}")
print(f"  responsibilities: {stats['missing_en_resp']}")
print(f"  soulContent: {stats['missing_en_soul']}")
print(f"\nMissing Traditional Chinese (zh-XG):")
print(f"  name: {stats['missing_zhXG_name']}")
print(f"  description: {stats['missing_zhXG_desc']}")
print(f"  responsibilities: {stats['missing_zhXG_resp']}")
print(f"  soulContent: {stats['missing_zhXG_soul']}")
print(f"\nEmpty responsibilities (all locales): {stats['empty_resp']}")

if empty_resp_list:
    print(f"\nRoles with empty responsibilities ({len(empty_resp_list)}):")
    for r in empty_resp_list:
        print(f"  {r}")
