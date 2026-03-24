# SMS Outreach Campaign — InkThorn Crustacean

## Platform Recommendation: Twilio or SimpleTexting

### Cheapest Option: **SimpleTexting**
- $29/mo for 500 credits (1 credit = 1 SMS segment ~160 chars)
- Built-in compliance (opt-out handling, STOP keyword)
- CSV import, merge tags, scheduled sends
- Good for a one-person operation
- signup: simpletexting.com

### Scalable Option: **Twilio**
- ~$0.0079/SMS outbound (543 messages = ~$4.28 total)
- Needs a 10DLC registered number (~$4/mo) + brand registration ($4 one-time)
- More setup but virtually unlimited scale
- Can automate responses

### Recommended for now: **SimpleTexting** — fast, cheap, compliant, no dev work

---

## ⚠️ TCPA Compliance Notes
- Business-to-business SMS (B2B) has more relaxed rules than B2C
- These are business phone numbers, not personal cell phones
- Still best practice: include opt-out instruction ("Reply STOP to opt out")
- Do NOT send between 9pm–8am local time
- Keep a suppression list of anyone who replies STOP

---

## SMS Message Templates

### Message 1 — Primary (under 160 chars)

```
Hi, I'm Rob from InkThorn. I built a free website preview for [Business Name]. 
When someone asks ChatGPT for your type of business in NOLA — you don't come up. 
We fix that. See it: inkthorn.ai/crustacean Reply STOP to opt out.
```

**Character count check:** ~220 chars = 2 segments. Shorten to 1 segment:

### Message 1 — Tight (160 chars, 1 segment)

```
Hi, Rob @ InkThorn — I built a free website for [Business Name]. ChatGPT doesn't know you exist yet. We fix that for $39/mo. inkthorn.ai/crustacean — Reply STOP to opt out
```
(168 chars — 2 segments, acceptable)

### Message 1 — Ultra Short (if platform charges per segment)

```
Hi [Business Name] — ChatGPT can't find you. We fix that. Free preview ready: inkthorn.ai/crustacean Reply STOP to opt out
```
(123 chars ✅ 1 segment)

---

## Response Handling

**If they reply with interest:** Forward to rob@inkthorn.ai or your Calendly link
**If they reply STOP:** Add to suppression list immediately (SimpleTexting does this automatically)
**If they reply with a question:** Respond personally — this is a hot lead

---

## Suggested Send Schedule

- **Batch 1 (100 leads):** Tuesday 10am CDT — test open/response rate
- **Batch 2 (200 leads):** Thursday 10am CDT — if batch 1 positive
- **Batch 3 (243 leads):** Following Tuesday — final batch

Send in batches to avoid carrier flagging and to manage responses.

---

## Lead File
`data/sms-leads.csv` — 543 records, E.164 format (+1XXXXXXXXXX), ready for CSV import

Categories:
- beauty_salon: 246
- bar: 100
- bakery: 72
- hair_salon: 71
- cafe: 30
- restaurant: 19
- meal_delivery: 5
