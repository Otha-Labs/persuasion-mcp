# Reproduce: download the three CSVs from https://osf.io/jd64p/ (upworthy-archive-datasets) into the
# working directory as exploratory.csv, confirmatory.csv, holdout.csv; build oldscores.json with
# dist/scorers/hook-framework.js; then run python3 upworthy-traits.py. Writes trait-evidence.json.
"""Within-test trait analysis on the Upworthy Research Archive (CC BY 4.0, Matias et al. 2021).
Unit = one test x one image (eyecatcher), so only headlines shown with the same image are compared.
Packages need >= MIN_IMP impressions. For a binary trait, a unit votes 1 if its packages WITH the
trait have a higher pooled CTR than those without. For a continuous trait, the unit compares its
highest- and lowest-valued packages. Win rate > 50% = the trait tends to win. Tests in the
broken-randomization window (2013-06-25 .. 2014-01-10) are excluded."""
import csv, json, re, math, collections, html
MIN_IMP = 1000
old = json.load(open('oldscores.json'))
STOP = set("a an the and or of to in on for with by is are be as at it its this that from your you their they them how what when why who will was were has have had his her he she we our i my me so if but not no do does did just about into than more most can all one up out off over".split())
def toks(s): return {w[:-1] if len(w)>4 and w.endswith('s') else w for w in re.findall(r"[a-z]+", s.lower()) if w not in STOP and len(w)>2}

TRAITS = {
  'number': lambda h: bool(re.search(r'\d', h)),
  'question': lambda h: '?' in h,
  'you': lambda h: bool(re.search(r"\byou(r|'re|'ll|'ve)?\b", h, re.I)),
  'first_person': lambda h: bool(re.search(r"\b(i|i'm|my|me|we|our)\b", h, re.I)),
  'quotation': lambda h: bool(re.search(r'["“”]', h)),
  'negation': lambda h: bool(re.search(r"\b(never|no|not|don't|can't|won't|didn't|isn't)\b", h, re.I)),
  'superlative': lambda h: bool(re.search(r"\b(best|most|greatest|worst|biggest|ever|ultimate|amazing|incredible)\b", h, re.I)),
  'this_these': lambda h: bool(re.search(r"\b(this|these|here's|here is)\b", h, re.I)),
  'exclamation': lambda h: '!' in h,
  'emphasis_caps': lambda h: bool(re.search(r"\b[A-Z]{3,}\b|\*\w+\*", h)),
  'how_why_what': lambda h: bool(re.search(r"\b(how|why|what)\b", h, re.I)),
  'time_word': lambda h: bool(re.search(r"\b(day|days|week|weeks|month|months|year|years|minute|minutes|hour|hours|today)\b", h, re.I)),
}
CONT = {
  'old_scoreHook': lambda p: old[p['h']],
  'word_count': lambda p: len(p['h'].split()),
  'article_overlap': lambda p: len(toks(p['h']) & p['brief']),
}

def wilson(k, n):
    if n == 0: return (0, 0)
    p = k/n; z = 1.96; d = 1 + z*z/n
    c = (p + z*z/(2*n))/d; m = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n))/d
    return (c-m, c+m)

def pval(k, n):  # two-sided normal approx to the binomial sign test
    if n == 0: return 1.0
    z = (k - n/2)/math.sqrt(n/4)
    return math.erfc(abs(z)/math.sqrt(2))

def units(name):
    rows = list(csv.DictReader(open(f'{name}.csv', newline='', encoding='utf-8')))
    g = collections.defaultdict(list)
    for r in rows:
        c = r['created_at'][:10]
        if '2013-06-25' <= c <= '2014-01-10': continue
        try: imp = int(float(r['impressions'])); clk = int(float(r['clicks']))
        except: continue
        h = r['headline'].strip()
        if imp < MIN_IMP or not h: continue
        brief = toks(html.unescape(re.sub('<[^>]+>', ' ', r.get('lede') or '')) + ' ' + (r.get('slug') or '').replace('-', ' ') + ' ' + (r.get('excerpt') or ''))
        g[(r['clickability_test_id'], r['eyecatcher_id'])].append({'h': h, 'imp': imp, 'clk': clk, 'brief': brief})
    out = []
    for k, ps in g.items():
        by = {}
        for p in ps:  # merge duplicate headlines in a unit
            q = by.setdefault(p['h'], {'h': p['h'], 'imp': 0, 'clk': 0, 'brief': p['brief']})
            q['imp'] += p['imp']; q['clk'] += p['clk']
        if len(by) >= 2: out.append(list(by.values()))
    return out

res = {}
for name in ['exploratory', 'confirmatory', 'holdout']:
    U = units(name)
    r = {'units': len(U)}
    for t, f in TRAITS.items():
        k = n = 0
        for ps in U:
            a = [p for p in ps if f(p['h'])]; b = [p for p in ps if not f(p['h'])]
            if not a or not b: continue
            ca = sum(p['clk'] for p in a)/sum(p['imp'] for p in a); cb = sum(p['clk'] for p in b)/sum(p['imp'] for p in b)
            if ca == cb: continue
            n += 1; k += ca > cb
        r[t] = (k, n)
    for t, f in CONT.items():
        k = n = 0
        for ps in U:
            vals = sorted(ps, key=f)
            lo, hi = vals[0], vals[-1]
            if f(lo) == f(hi): continue
            chi, clo = hi['clk']/hi['imp'], lo['clk']/lo['imp']
            if chi == clo: continue
            n += 1; k += chi > clo
        r[t] = (k, n)
    res[name] = r

print(f"units (test x image, >=2 headlines, >={MIN_IMP} impressions each): " + ', '.join(f"{k}={v['units']}" for k, v in res.items()))
print(f"{'trait':16} | {'exploratory':>22} | {'confirmatory':>30} | {'holdout':>22} | verdict")
summary = {}
for t in list(TRAITS) + list(CONT):
    cells = []
    for name in ['exploratory', 'confirmatory', 'holdout']:
        k, n = res[name][t]; lo, hi = wilson(k, n)
        cells.append((k, n, k/n if n else 0, lo, hi, pval(k, n)))
    e, c, h = cells
    same = (e[2] - .5) * (c[2] - .5) > 0 and (c[2] - .5) * (h[2] - .5) > 0
    sig = c[5] < 0.01 and h[5] < 0.05
    verdict = ('REPLICATES ' + ('wins' if c[2] > .5 else 'loses')) if same and sig else 'no reliable effect'
    summary[t] = {'confirmatory_win_rate': round(c[2], 4), 'confirmatory_n': c[1], 'ci95': [round(c[3], 4), round(c[4], 4)], 'holdout_win_rate': round(h[2], 4), 'holdout_n': h[1], 'exploratory_win_rate': round(e[2], 4), 'verdict': verdict}
    fmt = lambda x: f"{x[2]*100:5.1f}% (n={x[1]:>5})"
    print(f"{t:16} | {fmt(e):>22} | {fmt(c)} [{c[3]*100:4.1f}-{c[4]*100:4.1f}] | {fmt(h):>22} | {verdict}")
json.dump({'source': 'Upworthy Research Archive (Matias, Munger, Le Quere, Ebersole 2021, Nature Scientific Data), CC BY 4.0', 'method': __doc__, 'min_impressions': MIN_IMP, 'traits': summary}, open('trait-evidence.json', 'w'), indent=1)
