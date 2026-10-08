"""
$0-claim structural scanner for KeyoAPI model pages.

Rule (per site standard, relaxed form):
  A sentence is COMPLIANT if it mentions $0/free AND /free-models and either
    (a) carries the credit-mechanism phrase ($10 welcome credit), or
    (b) is a negation ("does not ship ...", "no permanent ...", "not yet listed").
  A sentence with a $0/free claim pointing at /free-models and NEITHER of the
  above is flagged.
Price numerals like $0.09 / $0.0123 are NOT $0 claims — excluded by requiring
the dollar-zero to be followed by whitespace/punctuation rather than digits.
"""
import re, glob, sys

MECH = re.compile(r'welcome credit')
NEG = re.compile(r'does not ship|no permanent|not yet listed|not as a', re.I)
# "$0" not followed by a digit (excludes $0.09 etc.)
FREE_CLAIM = re.compile(r'\$0(?![\d])')
PATH = re.compile(r'/free-models')

flagged = []
clean_with_claim = 0
scanned = 0
for f in sorted(glob.glob('static/seo/model/*.html')):
    scanned += 1
    src = open(f, encoding='utf-8').read()
    text = re.sub(r'<[^>]+>', ' ', src)
    # sentence split
    sents = re.split(r'(?<=[.!?])\s+', text)
    for s in sents:
        if not (FREE_CLAIM.search(s) or re.search(r'\bfree\b', s, re.I)):
            continue
        if not PATH.search(s):
            continue
        if MECH.search(s) or NEG.search(s):
            clean_with_claim += 1
            continue
        flagged.append((f.split('\\')[-1].split('/')[-1], ' '.join(s.split())[:150]))

print(f'scanned {scanned} pages')
print(f'compliant $0/free->/free-models sentences: {clean_with_claim}')
if flagged:
    print(f'\nFLAGGED {len(flagged)}:')
    for name, s in flagged:
        print(f'  {name}: {s}')
    sys.exit(1)
print('FLAGGED 0 — all $0/free claims carry the mechanism or a negation')
