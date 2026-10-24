OFFICIAL_SOURCES = [
 {"title":"India Code — Central and state legislation","url":"https://www.indiacode.nic.in/"},
 {"title":"Supreme Court of India","url":"https://www.sci.gov.in/"},
 {"title":"eCourts Services","url":"https://ecourts.gov.in/"},
 {"title":"Department of Justice","url":"https://doj.gov.in/"},
 {"title":"Legislative Department","url":"https://legislative.gov.in/"},
 {"title":"e-Gazette of India","url":"https://egazette.nic.in/"},
 {"title":"National Portal of India","url":"https://www.india.gov.in/"}]
def source_context(state):
    links = "\n".join(f"- {s['title']}: {s['url']}" for s in OFFICIAL_SOURCES)
    return f"Official source-discovery links (not proof a provision applies):\n{links}\nSelected state/UT: {state}. Verify state laws, amendments and rules on relevant official state portals. Never invent direct URLs."
