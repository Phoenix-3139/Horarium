# NYU Nomenclature

Authoritative reference for subject prefixes, catalog-number suffix
patterns, session codes, and component vocabulary used throughout NYU's
course listings. This is what the Horarium parser validates against.

## Provenance

- **Source:** `bulletins.nyu.edu` scrape, 2026-04-24.
- **Harvester:** `_scrapedData 24-04-2026/scrape.js` (sibling of the Horarium repo on the author's machine, not committed here; one-shot Node 20 script, ~12-minute runtime, rate-limited at 600ms per request).
- **Courses harvested:** 18,805.
- **Distinct prefixes:** 685 (all now assigned to a degree-granting or non-degree NYU unit).
- **Distinct catalog-suffix patterns:** 36.
- **Manual patching (2026-04-24):** The scrape's school-discovery step missed 31 prefixes — they appeared under `/courses/` but weren't reachable from any school's Course Inventory A-Z page (see `docs/LESSONS.md` for the postmortem). All 31 were manually resolved via `bulletins.nyu.edu` site-search + grading-label inspection and merged into the main table below.

## Re-running the harvester

When NYU adds new prefixes (usually once a year at term rollover, or when a new school launches), re-run the harvester and update sections 1 and 2 from the new `nomenclature-reduced.md`:

```bash
cd "/path/to/NYU-Nomenclature-Harvester"
rm -rf cache/                    # force refetch; otherwise uses disk cache
node scrape.js                   # writes nomenclature-raw.json + nomenclature-reduced.md
```

Then diff the new `nomenclature-reduced.md` against this doc. Any new prefix needs a row; any new suffix needs a parser note. Sections 3–5 cannot be refreshed from the bulletin — they require live Albert class-search pastes.

**Watch for the harvester gap.** The 2026-04-24 run missed ~5% of prefixes because its school-discovery step doesn't paginate every school's A-Z or follow sub-program course lists (CUSP-GX at Tandon, COR2-GB at Stern, etc.). Until that's fixed, new unassigned rows should be manually investigated, not trusted.

---

## 1. Subject prefix → school

One prefix, one school. The scrape found zero cross-school prefix cross-listing — a prefix uniquely identifies a school. The Horarium parser's `unknown_subject_suffix` warning fires on anything outside this table.

**On the `*[manually assigned]*` flag.** Rows tagged this way in the Prefix column were patched in by hand on 2026-04-24 because the 2026-04-24 harvester's school-discovery step missed them — either the prefix lived at a school the crawl reached but under a sub-page it didn't follow (Tandon's CUSP, Stern's capstones), or the prefix lived at an NYU unit the crawl never reached at all (Courant Institute's K-12 math outreach). These assignments are authoritative but the evidence is **per-suffix-family pattern inheritance** (verified once per family via grading-label inspection: `"SPS Non-Credit Graded"`, `"Grad Stern"`, `"Ugrd Abu Dhabi Graded"`, etc.) rather than per-row direct confirmation. A row flagged `*[manually assigned]*` should be double-checked the first time a real Albert paste pushes it through the parser. See `docs/LESSONS.md` for the harvester-gap analysis and the proposed fallback rule that would auto-assign ~95% of the "unassigned" bucket in future runs.

### College of Arts and Science  
_54 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ANST-UA | College of Arts and Science | 9 | ANST-UA 200 Animals & Society |
| ANTH-UA | College of Arts and Science | 111 | ANTH-UA 1 Introduction to Cultural Anthropology |
| ARTH-UA | College of Arts and Science | 101 | ARTH-UA 1 History of Western Art I |
| BIOL-UA | College of Arts and Science | 69 | BIOL-UA 3 Human Reproduction & Development |
| CAMS-UA | College of Arts and Science | 51 | CAMS-UA 101 Child & Adolescent Psychopathology |
| CFI-UA | College of Arts and Science | 1 | CFI-UA 101 Cultural Foundations I |
| CHEM-UA | College of Arts and Science | 38 | CHEM-UA 120 Introduction to Modern Chemistry |
| CLASS-UA | College of Arts and Science | 66 | CLASS-UA 2 Intensive Elementary Latin |
| COHRT-UA *[manually assigned]* | College of Arts and Science | 1 | COHRT-UA 10 First-Year Cohort Meeting: Authoring your NYU Story |
| COLIT-UA | College of Arts and Science | 38 | COLIT-UA 116 Approaching Comparative Literature |
| COLU-UA | College of Arts and Science | 38 | COLU-UA 11 Elementary Bengali I |
| CORE-UA | College of Arts and Science | 87 | CORE-UA 1 Complexities: Oceans |
| CRWRI-UA | College of Arts and Science | 22 | CRWRI-UA 815 Creative Writing: Intro Prose & Poetry |
| CSCI-UA | College of Arts and Science | 45 | CSCI-UA 2 Introduction to Computer Programming (No Prior Experience) |
| DRLIT-UA | College of Arts and Science | 61 | DRLIT-UA 101 Introduction to Drama & Theatre |
| DS-UA | College of Arts and Science | 12 | DS-UA 100 Survey in Data Science |
| EAST-UA | College of Arts and Science | 104 | EAST-UA 91 East Asian Art I: China, Korea, Japan to 1000 Ce |
| ECON-UA | College of Arts and Science | 48 | ECON-UA 1 Introduction to Macroeconomics |
| ENGL-UA | College of Arts and Science | 89 | ENGL-UA 56 Topics: |
| ENVST-UA | College of Arts and Science | 66 | ENVST-UA 100 Environmental Systems Science |
| EURO-UA | College of Arts and Science | 28 | EURO-UA 167 History of Germany in the 20th Century |
| EXPOS-UA | College of Arts and Science | 19 | EXPOS-UA 1 Writing as Inquiry |
| FREN-UA | College of Arts and Science | 97 | FREN-UA 1 Elemen French Level I |
| FYSEM-UA | College of Arts and Science | 189 | FYSEM-UA 1 Complexities: Ocean |
| GERM-UA | College of Arts and Science | 48 | GERM-UA 1 Elementary German I |
| HBRJD-UA | College of Arts and Science | 77 | HBRJD-UA 1 Elementary Hebrew I |
| HEL-UA | College of Arts and Science | 30 | HEL-UA 103 Elementary Moder Greek I |
| HIST-UA | College of Arts and Science | 203 | HIST-UA 3 Modern South Asia, 1700-2000 |
| INTRL-UA | College of Arts and Science | 2 | INTRL-UA 990 Ir Senior Seminar |
| IRISH-UA | College of Arts and Science | 35 | IRISH-UA 100 Modern Irish Language Elementary I |
| ITAL-UA | College of Arts and Science | 74 | ITAL-UA 1 Elementary Italian I |
| JOUR-UA | College of Arts and Science | 26 | JOUR-UA 21 Report New York |
| LATC-UA | College of Arts and Science | 32 | LATC-UA 101 Elementary Quechua I |
| LING-UA | College of Arts and Science | 43 | LING-UA 1 Language |
| LWSOC-UA | College of Arts and Science | 7 | LWSOC-UA 1 Law and Society |
| MATH-UA | College of Arts and Science | 68 | MATH-UA 9 Algebra, Trigonometry, and Functions |
| MEDI-UA | College of Arts and Science | 64 | MEDI-UA 1 History of Western Art I |
| MEIS-UA | College of Arts and Science | 58 | MEIS-UA 101 Elementary Arabic I |
| MHUM-UA | College of Arts and Science | 2 | MHUM-UA 101 Introduction to the Medical Humanities |
| MUSIC-UA | College of Arts and Science | 29 | MUSIC-UA 3 The Art of Listening: |
| NEURL-UA | College of Arts and Science | 14 | NEURL-UA 100 Introduction to Neural Science |
| NODEP-UA | College of Arts and Science | 30 | NODEP-UA 100 Special Topics Seminar: Authoring Your NYU Story |
| PHIL-UA | College of Arts and Science | 61 | PHIL-UA 1 Central Problems in Philosophy |
| PHYS-UA | College of Arts and Science | 35 | PHYS-UA 7 The Universe: Its Nature and History |
| POL-UA | College of Arts and Science | 93 | POL-UA 100 Political Theory |
| PORT-UA | College of Arts and Science | 25 | PORT-UA 1 Portuguese for Beginners I |
| PSYCH-UA | College of Arts and Science | 47 | PSYCH-UA 1 Intro to Psychology |
| PUBPL-UA | College of Arts and Science | 2 | PUBPL-UA 800 Senior Seminar |
| RELST-UA | College of Arts and Science | 58 | RELST-UA 1 Theories & Methods in The Study of Religion |
| RUSSN-UA | College of Arts and Science | 46 | RUSSN-UA 1 Elementary Russian I |
| SCA-UA | College of Arts and Science | 141 | SCA-UA 18 Topics in Social & Cultural Analysis: |
| SOC-UA | College of Arts and Science | 53 | SOC-UA 1 Intro to Sociology |
| SPAN-UA | College of Arts and Science | 118 | SPAN-UA 1 Spanish for Beginners- Level I |
| URBS-UA | College of Arts and Science | 4 | URBS-UA 101 Social and Cultural Analysis 101 |

### College of Dentistry  
_34 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| BAS01-DN | College of Dentistry | 16 | BAS01-DN 1508 Bldg Blocks of Life |
| BAS06-DN | College of Dentistry | 5 | BAS06-DN 1608 General Pathology |
| BASCI-DN | College of Dentistry | 13 | BASCI-DN 5055 Advanced Education Core Sciences |
| BEH03-DN | College of Dentistry | 7 | BEH03-DN 1513 Health Promotion and Disease Prevention |
| BEH05-DN | College of Dentistry | 9 | BEH05-DN 1509 Clinical Epidemiology |
| BEHSC-DN | College of Dentistry | 6 | BEHSC-DN 9304 Principles of Prosthodontics I A |
| BIOMS-DN | College of Dentistry | 22 | BIOMS-DN 1000 Principles of Biomaterials Science |
| CLS03-DN | College of Dentistry | 12 | CLS03-DN 1510 Multidisciplinary Practice of Dentistry |
| CLS04-DN | College of Dentistry | 2 | CLS04-DN 3518 Endodontics Clinic |
| CLS06-DN | College of Dentistry | 6 | CLS06-DN 1608 Preclinical Radiology |
| CLS07-DN | College of Dentistry | 2 | CLS07-DN 3512 Oral & Maxillofacial Surgery Clinic |
| CLS08-DN | College of Dentistry | 1 | CLS08-DN 4623 D3-D4 InvisAlign Clinic Rotation |
| CLS09-DN | College of Dentistry | 4 | CLS09-DN 1608 Pediatric Dentistry for The New Dentist |
| CLS10-DN | College of Dentistry | 3 | CLS10-DN 3509 Periodontics Clinic |
| CLS11-DN | College of Dentistry | 6 | CLS11-DN 3514 Clinical - Fixed Prosth & Implants |
| CLSCI-DN | College of Dentistry | 11 | CLSCI-DN 7016 Practicum in Clinical Research Center I |
| DGS03-DN | College of Dentistry | 4 | DGS03-DN 2610 Diagnosis & Treatment of Oral Disease |
| DGS06-DN | College of Dentistry | 5 | DGS06-DN 1508 Introduction to Oral Maxillofacial Radiology |
| DGS07-DN | College of Dentistry | 3 | DGS07-DN 1608 CPR Certification |
| DGS10-DN | College of Dentistry | 1 | DGS10-DN 3610 Elective in Precision Medicine |
| DGSCI-DN | College of Dentistry | 132 | DGSCI-DN 8043 Comprehensive Treatment Planning III A |
| DHYG1-UD | College of Dentistry | 22 | DHYG1-UD 100 Human Microbiology I |
| DHYG2-UD | College of Dentistry | 14 | DHYG2-UD 130 Prin of Dh III Lec |
| DHYG3-UD | College of Dentistry | 12 | DHYG3-UD 150 Advanced Allied Dental Education |
| ETH05-DN | College of Dentistry | 1 | ETH05-DN 4508 Seminars in Ethics |
| PCL02-DN | College of Dentistry | 1 | PCL02-DN 3511 Adv Restorative Dentistry & Biomaterials |
| PCL03-DN | College of Dentistry | 5 | PCL03-DN 1509 Dental Anatomy and Occlusion |
| PCL04-DN | College of Dentistry | 1 | PCL04-DN 3508 Adv Endodontics |
| PCL07-DN | College of Dentistry | 1 | PCL07-DN 2512 Introduction to OMS, Pain and Anxiety Control |
| PCL08-DN | College of Dentistry | 6 | PCL08-DN 2510 Orthodontic Diagnosis & Treatment Planning |
| PCL09-DN | College of Dentistry | 2 | PCL09-DN 2508 Gen Dent Simulation II Pediatric Dentistry |
| PCL10-DN | College of Dentistry | 2 | PCL10-DN 3510 Adv Periodontics |
| PCL11-DN | College of Dentistry | 3 | PCL11-DN 2509 Simulation-Fixed & Implant Prostheses |
| PRECL-DN | College of Dentistry | 36 | PRECL-DN 8076 Advanced Education in Orthodontics Clinic I A |

### Courant Institute of Mathematical Sciences  
_1 prefix_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| CTM-NA *[manually assigned]* | Courant Institute of Mathematical Sciences | 1 | CTM-NA 100 Math Program for Talented Youth |

### Gallatin School of Individualized Study  
_12 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ARTS-UG | Gallatin School of Individualized Study | 103 | ARTS-UG 1007 Keeping It Real: Realism in Writing and Acting on Stage |
| CORE-GG | Gallatin School of Individualized Study | 14 | CORE-GG 2025 Proseminar: Theory and Methods in the Social Sciences: Interdisciplinary Perspectives |
| ELEC-GG | Gallatin School of Individualized Study | 33 | ELEC-GG 2033 Graduate Writing Seminar: Global Issues |
| FIRST-UG | Gallatin School of Individualized Study | 183 | FIRST-UG 24 First-Year Interdisciplinary Seminar: Migration & American Culture |
| IDSEM-UG | Gallatin School of Individualized Study | 515 | IDSEM-UG 1042 Digital Revolution: History of Media III |
| INDIV-GG | Gallatin School of Individualized Study | 4 | INDIV-GG 2701 Private Lesson |
| INDIV-UG | Gallatin School of Individualized Study | 21 | INDIV-UG 1701 Private Lesson |
| PRACT-UG | Gallatin School of Individualized Study | 12 | PRACT-UG 1301 Practicum in Fashion Business |
| SASEM-UG | Gallatin School of Individualized Study | 17 | SASEM-UG 9102 Topics in German Cinema: |
| SCHOL-GG | Gallatin School of Individualized Study | 1 | SCHOL-GG 2802 Global Fellowship in Urban Practice |
| TRAVL-UG | Gallatin School of Individualized Study | 7 | TRAVL-UG 1200 The Art of Travel |
| WRTNG-UG | Gallatin School of Individualized Study | 54 | WRTNG-UG 1012 Three Modern Essayists: Woolf, Orwell, Baldwin |

### Graduate School of Arts and Science  
_55 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| AFRS-GA | Graduate School of Arts and Science | 8 | AFRS-GA 2000 Proseminar in Africana Studies |
| AMST-GA | Graduate School of Arts and Science | 17 | AMST-GA 2100 Tpcs in Critical Theory: |
| ANST-GA *[manually assigned]* | Graduate School of Arts and Science | 6 | ANST-GA 1000 Animals. Culture and Society |
| ANTH-GA | Graduate School of Arts and Science | 73 | ANTH-GA 1001 Theories and Methods in the Study of Religion |
| ARTH-GA *[manually assigned]* | Graduate School of Arts and Science | 10 | ARTH-GA 9001 Adaptive Reuse of Bldgs: Successes & Failures I |
| BIOL-GA | Graduate School of Arts and Science | 55 | BIOL-GA 1001 Bio Core I: Molecular Systems |
| BMIN-GA | Graduate School of Arts and Science | 23 | BMIN-GA 3 Advanced Topics in Biomedical Informatics |
| BMSC-GA | Graduate School of Arts and Science | 144 | BMSC-GA 1358 Introduction to Programming |
| CEH-GA | Graduate School of Arts and Science | 37 | CEH-GA 1012 Oral History |
| CHEM-GA | Graduate School of Arts and Science | 33 | CHEM-GA 1113 Chemistry of the Transition Metals |
| CLASS-GA | Graduate School of Arts and Science | 41 | CLASS-GA 1001 Intro to Classical Stds |
| COLIT-GA | Graduate School of Arts and Science | 35 | COLIT-GA 1400 Sem in Lit:Rsch Mthds Tchnqs: |
| CRWRI-GA | Graduate School of Arts and Science | 10 | CRWRI-GA 1910 Workshop in Poetry I |
| CSCI-GA | Graduate School of Arts and Science | 43 | CSCI-GA 1133 PAC I |
| DHSS-GA | Graduate School of Arts and Science | 4 | DHSS-GA 1120 Introduction to Programming |
| DS-GA | Graduate School of Arts and Science | 26 | DS-GA 1001 Introduction to Data Science |
| EAST-GA | Graduate School of Arts and Science | 11 | EAST-GA 1001 First Year Sem: Intro to Critical Asian Studies |
| ECON-GA | Graduate School of Arts and Science | 81 | ECON-GA 1001 Math for Economists (MA) |
| EHSC-GA | Graduate School of Arts and Science | 60 | EHSC-GA 1004 Environmental Health |
| ENGL-GA | Graduate School of Arts and Science | 43 | ENGL-GA 1060 Introductory Old English |
| ENVST-GA | Graduate School of Arts and Science | 7 | ENVST-GA 1000 Foundations of Environmental Studies: Natural Science Perspectives |
| EURO-GA | Graduate School of Arts and Science | 12 | EURO-GA 1156 Topics: |
| FINH-GA | Graduate School of Arts and Science | 48 | FINH-GA 1000 French Language Instruction |
| FREN-GA | Graduate School of Arts and Science | 27 | FREN-GA 1 French for Reading Knowledge |
| GERM-GA | Graduate School of Arts and Science | 10 | GERM-GA 1112 Problems in Critical Theories: |
| HBRJD-GA | Graduate School of Arts and Science | 91 | HBRJD-GA 1002 Jewish Philosophy and Its Critics |
| HIST-GA | Graduate School of Arts and Science | 88 | HIST-GA 1001 Topics Colloquium |
| IFST-GA | Graduate School of Arts and Science | 33 | IFST-GA 1066 Cinema Culture of France |
| INTRL-GA | Graduate School of Arts and Science | 57 | INTRL-GA 1120 Quantitative Analysis I |
| IRISH-GA | Graduate School of Arts and Science | 21 | IRISH-GA 1001 Irish Studies Seminar I |
| ISAW-GA | Graduate School of Arts and Science | 14 | ISAW-GA 1000 Intro to Ancient Egyptian I |
| ITAL-GA | Graduate School of Arts and Science | 34 | ITAL-GA 1 Italian for Reading Knowledge |
| JOUR-GA | Graduate School of Arts and Science | 59 | JOUR-GA 11 First Amendment Law |
| LATC-GA | Graduate School of Arts and Science | 5 | LATC-GA 1001 Intro Lat Am & Carib I: Iberian-Atl & Colonial |
| LING-GA | Graduate School of Arts and Science | 33 | LING-GA 44 Field Methods |
| MAINT-GA | Graduate School of Arts and Science | 1 | MAINT-GA 4747 Maintain Matriculation |
| MATH-GA | Graduate School of Arts and Science | 107 | MATH-GA 1002 Multivariable Analysis |
| MEDI-GA | Graduate School of Arts and Science | 4 | MEDI-GA 1100 Proseminar in Medieval & Renaissance Studies |
| MEIS-GA | Graduate School of Arts and Science | 62 | MEIS-GA 1005 Advanced Arabic I |
| MSMS-GA | Graduate School of Arts and Science | 20 | MSMS-GA 1089 Digital Humanities: Collections and Connections |
| MUSIC-GA | Graduate School of Arts and Science | 13 | MUSIC-GA 1001 Collegium Musicum |
| NEST-GA *[manually assigned]* | Graduate School of Arts and Science | 12 | NEST-GA 1720 Reporting The Middle East |
| NEURL-GA | Graduate School of Arts and Science | 16 | NEURL-GA 2201 Cellular Neuroscience |
| PDPSA-GA *[manually assigned]* | Graduate School of Arts and Science | 9 | PDPSA-GA 4547 Introduction to Contemporary Psychoanalysis |
| PHIL-GA | Graduate School of Arts and Science | 44 | PHIL-GA 1000 Pro-Seminar |
| PHYS-GA | Graduate School of Arts and Science | 50 | PHYS-GA 1500 Elect for Scientists I |
| POET-GA | Graduate School of Arts and Science | 2 | POET-GA 2001 Pro seminar in Poetics & Theory: The Origins of Lit Theory |
| POL-GA | Graduate School of Arts and Science | 52 | POL-GA 1100 Hist of Pol & Social Thought |
| PORT-GA | Graduate School of Arts and Science | 4 | PORT-GA 1104 Portuguese for Spanish Speakers |
| PSYCH-GA | Graduate School of Arts and Science | 96 | PSYCH-GA 2002 Psychology of Music |
| PUBHM-GA *[manually assigned]* | Graduate School of Arts and Science | 2 | PUBHM-GA 1001 Introduction to the Public Humanities |
| RELST-GA | Graduate School of Arts and Science | 22 | RELST-GA 1001 Theories & Methods in The Study of Religion |
| RUSSN-GA | Graduate School of Arts and Science | 18 | RUSSN-GA 1001 Topics in Russian & Slavic Studies |
| SOC-GA | Graduate School of Arts and Science | 55 | SOC-GA 1301 Design of Social Research |
| SPAN-GA | Graduate School of Arts and Science | 23 | SPAN-GA 1 Spanish for Reading Knowledge |

### Leonard N. Stern School of Business  
_35 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ACCT-GB | Leonard N. Stern School of Business | 62 | ACCT-GB 2103 Financial Statement Analysis |
| ACCT-UB | Leonard N. Stern School of Business | 19 | ACCT-UB 1 Prin of Financial Acctg |
| BPEP-UB | Leonard N. Stern School of Business | 9 | BPEP-UB 1 Intro to Econ & Pol Thgt |
| BSPA-GB | Leonard N. Stern School of Business | 30 | BSPA-GB 2105 Sustainability for Competitive Advantage |
| BSPA-UB | Leonard N. Stern School of Business | 16 | BSPA-UB 35 Real Estate Transactions And Law |
| BTEP-UB | Leonard N. Stern School of Business | 7 | BTEP-UB 1 Entrepreneurship: Mindset & Action |
| CONS-GB | Leonard N. Stern School of Business | 1 | CONS-GB 3012 Cprl Education Sector Seminar & Practicum |
| COR1-GB | Leonard N. Stern School of Business | 44 | COR1-GB 1101 Business Strategy |
| COR2-GB *[manually assigned]* | Leonard N. Stern School of Business | 5 | COR2-GB 3101 Professional Responsibility |
| DBIN-GB | Leonard N. Stern School of Business | 21 | DBIN-GB 3100 DBi: Location TBA |
| ECON-GB | Leonard N. Stern School of Business | 62 | ECON-GB 2110 Health and Medical Care Business |
| ECON-UB | Leonard N. Stern School of Business | 25 | ECON-UB 1 Microeconomics with Algebra |
| FINC-GB | Leonard N. Stern School of Business | 117 | FINC-GB 2102 Corporate Finance |
| FINC-UB | Leonard N. Stern School of Business | 41 | FINC-UB 2 Foundations of Finance |
| INTA-GB | Leonard N. Stern School of Business | 59 | INTA-GB 2000 Professional Practicum |
| MCOM-GB | Leonard N. Stern School of Business | 17 | MCOM-GB 2100 Management Communication |
| MGMT-GB | Leonard N. Stern School of Business | 93 | MGMT-GB 2100 Inclusive Leadership |
| MGMT-UB | Leonard N. Stern School of Business | 18 | MGMT-UB 1 Management and Organizations |
| MKTG-GB | Leonard N. Stern School of Business | 83 | MKTG-GB 2103 Marketing & Sustainability |
| MKTG-UB | Leonard N. Stern School of Business | 43 | MKTG-UB 1 Intro to Marketing |
| MULT-UB | Leonard N. Stern School of Business | 39 | MULT-UB 4 Personal Finance for Non-Economists |
| NOCR-GB *[manually assigned]* | Leonard N. Stern School of Business | 7 | NOCR-GB 1006 Accounting Prep: Financial Statement Analysis |
| OPMG-GB | Leonard N. Stern School of Business | 34 | OPMG-GB 2150 Decision Models & Analytics |
| OPMG-UB | Leonard N. Stern School of Business | 6 | OPMG-UB 1 Operations Management |
| SHBI-GB | Leonard N. Stern School of Business | 60 | SHBI-GB 1000 Capstone Phase I |
| SOIM-UB | Leonard N. Stern School of Business | 8 | SOIM-UB 3 Business and Society: Intensive |
| STAT-GB | Leonard N. Stern School of Business | 26 | STAT-GB 2301 Regression and Multivariate Data Analysis |
| STAT-UB | Leonard N. Stern School of Business | 14 | STAT-UB 1 Stats F/Business Control |
| TECH-GB | Leonard N. Stern School of Business | 51 | TECH-GB 2114 Cybersecurity & Privacy |
| TECH-UB | Leonard N. Stern School of Business | 25 | TECH-UB 1 Info Tech in Bus & Society |
| XBA1-GB | Leonard N. Stern School of Business | 19 | XBA1-GB 8106 Found of Stat Using R |
| XFN1-GB | Leonard N. Stern School of Business | 25 | XFN1-GB 8101 Finance Concepts and Math |
| XGF1-GB | Leonard N. Stern School of Business | 13 | XGF1-GB 8111 Module 1A |
| XRM1-GB | Leonard N. Stern School of Business | 33 | XRM1-GB 8003 Artificial Intelligence and Risk Management |
| XTR1-GB | Leonard N. Stern School of Business | 18 | XTR1-GB 8001 TRIUM: Module 2 |

### Liberal Studies  
_32 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ACA-UF | Liberal Studies | 2 | ACA-UF 101 Arts and Cultures across Antiquity |
| ACC-UF | Liberal Studies | 2 | ACC-UF 102 Arts and Cultures towards the Crossroads |
| ACM-UF | Liberal Studies | 2 | ACM-UF 201 Arts and Cultures of Modernity |
| AELS-UF | Liberal Studies | 1 | AELS-UF 1002 Academic English for Liberal Studies II |
| AFGC-UF | Liberal Studies | 2 | AFGC-UF 101 African Cultures |
| AGT-UF | Liberal Studies | 1 | AGT-UF 9301 Advanced Global Topics |
| APR-UF | Liberal Studies | 1 | APR-UF 201 Approaches: Sophomore Seminar |
| AWS-UF | Liberal Studies | 1 | AWS-UF 201 Advanced Writing Studio |
| CAGC-UF | Liberal Studies | 1 | CAGC-UF 101 Caribbean Cultures |
| CWE-UF | Liberal Studies | 1 | CWE-UF 101 Creative Writing Experiments |
| CWS-UF | Liberal Studies | 1 | CWS-UF 101 Creative Writing Studio |
| EAGC-UF | Liberal Studies | 1 | EAGC-UF 101 East Asian Cultures |
| ECI-UF | Liberal Studies | 2 | ECI-UF 101 Principles of Macroeconomics |
| ECII-UF | Liberal Studies | 2 | ECII-UF 102 Principles of Microeconomics |
| ELEC-UF | Liberal Studies | 3 | ELEC-UF 101 Liberal Studies Elective |
| ENSTU-UF | Liberal Studies | 2 | ENSTU-UF 101 Environmental Studies |
| FWS-UF | Liberal Studies | 2 | FWS-UF 201 Fieldwork Seminar |
| GT-UF | Liberal Studies | 2 | GT-UF 201 Global Topics: |
| GWA-UF | Liberal Studies | 2 | GWA-UF 101 Global Works and Society: Antiquity |
| GWC-UF | Liberal Studies | 2 | GWC-UF 102 Global Works and Society in a Changing World |
| GWM-UF | Liberal Studies | 2 | GWM-UF 201 Global Works and Society: Modernity |
| HOU-UF | Liberal Studies | 2 | HOU-UF 101 History of The Universe |
| IF-UF | Liberal Studies | 1 | IF-UF 201 Independent Fieldwork |
| JIRS-UF | Liberal Studies | 2 | JIRS-UF 301 Junior Independent Research Seminar |
| LAGC-UF | Liberal Studies | 2 | LAGC-UF 101 Latin American Cultures |
| LISCI-UF | Liberal Studies | 1 | LISCI-UF 101 Life Science |
| MEGC-UF | Liberal Studies | 1 | MEGC-UF 101 Middle Eastern Cultures |
| SAGC-UF | Liberal Studies | 2 | SAGC-UF 101 South Asian Cultures |
| SCTEC-UF | Liberal Studies | 1 | SCTEC-UF 101 Science of Technology |
| SUSCI-UF | Liberal Studies | 1 | SUSCI-UF 201 Sustainability Science: A History of Biodiversity and Climate Change |
| WRCI-UF | Liberal Studies | 2 | WRCI-UF 102 Writing as Critical Inquiry |
| WREX-UF | Liberal Studies | 2 | WREX-UF 101 Writing as Exploration |

### NYU Abu Dhabi  
_48 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ACS-UH | NYU Abu Dhabi | 19 | ACS-UH 1010X Anthropology and the Arab World |
| ANTH-UH | NYU Abu Dhabi | 9 | ANTH-UH 1010 Introduction to Anthropology |
| APHY-GH | NYU Abu Dhabi | 30 | APHY-GH 6010 Astrophysical Objects |
| ARABL-UH | NYU Abu Dhabi | 15 | ARABL-UH 1110 Elementary Arabic 1 |
| ARTH-UH | NYU Abu Dhabi | 32 | ARTH-UH 1010 Ways of Looking |
| ARTMD-GH | NYU Abu Dhabi | 20 | ARTMD-GH 5001 Graduate Critique Seminar 1 |
| AW-UH | NYU Abu Dhabi | 6 | AW-UH 1113X Alexander and the East: Central Asia and the Mediterranean from the Achaemenid Period |
| BIOL-UH | NYU Abu Dhabi | 24 | BIOL-UH 2010 Human Physiology |
| BUSOR-UH | NYU Abu Dhabi | 31 | BUSOR-UH 1003 Management & Organizations |
| CADT-UH | NYU Abu Dhabi | 35 | CADT-UH 1001 Manus et Machina |
| CCEA-UH | NYU Abu Dhabi | 45 | CCEA-UH 1001 Ritual and Play |
| CCOL-UH | NYU Abu Dhabi | 187 | CCOL-UH 1000 Mortal and Immortal Questions |
| CDAD-UH | NYU Abu Dhabi | 37 | CDAD-UH 1001Q Data |
| CHEM-UH | NYU Abu Dhabi | 20 | CHEM-UH 2010 Organic Chemistry 1 |
| CHINL-UH | NYU Abu Dhabi | 6 | CHINL-UH 1101 Elementary Chinese 1 |
| CS-UH | NYU Abu Dhabi | 23 | CS-UH 1001 Introduction to Computer Science |
| CSTS-UH | NYU Abu Dhabi | 44 | CSTS-UH 1006 Thinking |
| DAAH-UH *[manually assigned]* | NYU Abu Dhabi | 1 | DAAH-UH 1001 Introduction to Digital Arts and Humanities |
| ECON-GH | NYU Abu Dhabi | 19 | ECON-GH 5000 Math Camp |
| ECON-UH | NYU Abu Dhabi | 40 | ECON-UH 1112 Introduction to Macroeconomics |
| ENGR-GH | NYU Abu Dhabi | 1 | ENGR-GH 7900 Graduate Seminar Series |
| ENGR-UH | NYU Abu Dhabi | 93 | ENGR-UH 1000 Computer Programming for Engineers |
| ENVR-UH | NYU Abu Dhabi | 1 | ENVR-UH 1312 Global Debate on Green Growth |
| FILMM-UH | NYU Abu Dhabi | 20 | FILMM-UH 1010 Sound, Image, and Story |
| FRENL-UH | NYU Abu Dhabi | 5 | FRENL-UH 1101 Elementary French 1 |
| HERST-UH | NYU Abu Dhabi | 4 | HERST-UH 1100 World Heritage Sites & Universal Collections |
| HIST-UH | NYU Abu Dhabi | 21 | HIST-UH 1105 Africa in the World |
| HISTN-UH *[manually assigned]* | NYU Abu Dhabi | 2 | HISTN-UH 1001 Global Histories: Encountering Human Questions |
| IM-UH | NYU Abu Dhabi | 29 | IM-UH 1010 Introduction to Interactive Media |
| JAPNL-UH | NYU Abu Dhabi | 2 | JAPNL-UH 1101 Beginning Japanese 1 |
| LAW-UH | NYU Abu Dhabi | 43 | LAW-UH 1010 What is Law? Comparative Global Jurisprudence |
| LITCW-UH | NYU Abu Dhabi | 30 | LITCW-UH 1000 Literary Interpretation |
| MATH-UH | NYU Abu Dhabi | 29 | MATH-UH 1000AQ Mathematics for Statistics and Calculus Part I |
| MUSIC-UH | NYU Abu Dhabi | 47 | MUSIC-UH 1001 Music Theory & Analysis I |
| PEACE-UH | NYU Abu Dhabi | 2 | PEACE-UH 1011 Foundations of Peace: Economic and Political Perspectives |
| PHIL-UH | NYU Abu Dhabi | 31 | PHIL-UH 1101 Central Problems in Philosophy |
| PHYED-UH | NYU Abu Dhabi | 75 | PHYED-UH 1001 Introduction to Group Fitness Classes |
| PHYS-UH | NYU Abu Dhabi | 22 | PHYS-UH 2010 Electromagnetism and Special Relativity |
| POLSC-UH | NYU Abu Dhabi | 29 | POLSC-UH 1111 Introduction to Comparative Politics |
| PSYCH-UH | NYU Abu Dhabi | 27 | PSYCH-UH 1001 Introduction to Psychology |
| PSYCN-UH | NYU Abu Dhabi | 3 | PSYCN-UH 1002 Gender & Representation: Field Study Workshop |
| SCIEN-UH | NYU Abu Dhabi | 14 | SCIEN-UH 1121EQ Foundations of Science 1-2: Physics |
| SOCSC-UH | NYU Abu Dhabi | 16 | SOCSC-UH 1010Q Statistics for the Social and Behavioral Sciences |
| SPANL-UH | NYU Abu Dhabi | 5 | SPANL-UH 1110 Elementary Spanish 1 |
| SRPP-UH | NYU Abu Dhabi | 37 | SRPP-UH 1413X Social Change and Development in the Arab World |
| THEAT-UH | NYU Abu Dhabi | 24 | THEAT-UH 1010 Making Theater |
| VISAR-UH | NYU Abu Dhabi | 2 | VISAR-UH 4000 Visual Arts Capstone Seminar |
| WRIT-UH | NYU Abu Dhabi | 29 | WRIT-UH 1000 Methods of the Written Voice I |

### NYU Grossman Long Island School of Medicine  
_20 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ANES-ML | NYU Grossman Long Island School of Medicine | 2 | ANES-ML 4063 Advanced Anesthesia |
| CVSUR-ML | NYU Grossman Long Island School of Medicine | 6 | CVSUR-ML 4009 Cardiothoracic Critical Care |
| ERMED-ML | NYU Grossman Long Island School of Medicine | 2 | ERMED-ML 3012 Emergency Medicine |
| FDNMD-ML | NYU Grossman Long Island School of Medicine | 4 | FDNMD-ML 1024 Special Topics in Inflammation and Lipid Research |
| FMMED-ML | NYU Grossman Long Island School of Medicine | 3 | FMMED-ML 1029 Introduction to Sports Medicine for Primary Care |
| INTER-ML | NYU Grossman Long Island School of Medicine | 32 | INTER-ML 1001 Transition to Medical School |
| MED-ML | NYU Grossman Long Island School of Medicine | 28 | MED-ML 1025 Introduction to Allergy and Immunology |
| NEURO-ML | NYU Grossman Long Island School of Medicine | 3 | NEURO-ML 2029 Neurology Clerkship |
| OBGYN-ML | NYU Grossman Long Island School of Medicine | 8 | OBGYN-ML 2003 Obstetrics & Gynecology Clerkship |
| ORTHO-ML | NYU Grossman Long Island School of Medicine | 4 | ORTHO-ML 4047 Orthopedics for Primary Care |
| OTOL-ML | NYU Grossman Long Island School of Medicine | 2 | OTOL-ML 4056 Ambulatory Otolaryngology (ENT) |
| PATH-ML | NYU Grossman Long Island School of Medicine | 3 | PATH-ML 1023 Special Topic in Pathology |
| PEDS-ML | NYU Grossman Long Island School of Medicine | 19 | PEDS-ML 2004 Pediatrics Clerkship |
| PRCAR-ML | NYU Grossman Long Island School of Medicine | 1 | PRCAR-ML 2005 Primary Care Clerkship |
| PSYCH-ML | NYU Grossman Long Island School of Medicine | 1 | PSYCH-ML 2006 Psychiatry Clerkship |
| RADON-ML | NYU Grossman Long Island School of Medicine | 1 | RADON-ML 4065 Radiation Oncology |
| RADS-ML | NYU Grossman Long Island School of Medicine | 3 | RADS-ML 1028 Introduction to Radiology for Primary Care Physicians |
| REHAB-ML | NYU Grossman Long Island School of Medicine | 2 | REHAB-ML 2030 Rehabilitation Medicine and Pain Management Selective |
| SURG-ML | NYU Grossman Long Island School of Medicine | 14 | SURG-ML 2007 Surgery Clerkship |
| URO-ML | NYU Grossman Long Island School of Medicine | 2 | URO-ML 4059 Pediatric Urology |

### NYU Grossman School of Medicine  
_28 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ANES-MD | NYU Grossman School of Medicine | 4 | ANES-MD 4005 Anesthesiology-Bh |
| CCSE-MD | NYU Grossman School of Medicine | 2 | CCSE-MD 3001 Comprehensive Clinical Skills Examination |
| CELLB-MD | NYU Grossman School of Medicine | 1 | CELLB-MD 4002 Review Of Gross Anatomy |
| CPSY-MD | NYU Grossman School of Medicine | 8 | CPSY-MD 4001 Adolescent In-Patient Psychiatry |
| CVSUR-MD | NYU Grossman School of Medicine | 6 | CVSUR-MD 4001 Cardiothor. Surgery -Tisch |
| DERM-MD | NYU Grossman School of Medicine | 3 | DERM-MD 4001 Dermatology Clerkship |
| ERMED-MD | NYU Grossman School of Medicine | 9 | ERMED-MD 4005 Medical Toxicology |
| FRMED-MD | NYU Grossman School of Medicine | 2 | FRMED-MD 4001 Forensic Medicine |
| HUM-MD | NYU Grossman School of Medicine | 1 | HUM-MD 4012 The Art of Seeing |
| ICINT-MD | NYU Grossman School of Medicine | 2 | ICINT-MD 3004 Integrated Clinical Skills I |
| INTD-MD | NYU Grossman School of Medicine | 1 | INTD-MD 4014 Health Equity |
| INTER-MD | NYU Grossman School of Medicine | 49 | INTER-MD 1034 Foundations of Medicine |
| MED-MD | NYU Grossman School of Medicine | 52 | MED-MD 3002 Ambulatory Care Clerkship |
| MS-MD | NYU Grossman School of Medicine | 2 | MS-MD 4012 Scientific Integrity And Responsible Conduct In Research (Non-Credit) |
| NEURO-MD | NYU Grossman School of Medicine | 9 | NEURO-MD 3001 Neurology |
| NEUSR-MD | NYU Grossman School of Medicine | 3 | NEUSR-MD 4001 Neurosurgery |
| OBGYN-MD | NYU Grossman School of Medicine | 9 | OBGYN-MD 3001 Obstetrics & Gynecology |
| OPHTH-MD | NYU Grossman School of Medicine | 5 | OPHTH-MD 4009 Advanced Ophthalmology |
| ORTHO-MD | NYU Grossman School of Medicine | 4 | ORTHO-MD 4001 Intro To Orthopedic Surgery |
| OTOL-MD | NYU Grossman School of Medicine | 3 | OTOL-MD 4003 Otolaryngology |
| PATH-MD | NYU Grossman School of Medicine | 4 | PATH-MD 4002 Anatomic Pathology |
| PEDS-MD | NYU Grossman School of Medicine | 16 | PEDS-MD 3003 Pediatrics |
| PSYCH-MD | NYU Grossman School of Medicine | 17 | PSYCH-MD 3001 Psychiatry |
| RADON-MD | NYU Grossman School of Medicine | 4 | RADON-MD 4001 Radiation Oncology |
| RADS-MD | NYU Grossman School of Medicine | 15 | RADS-MD 4003 Abdominal Imaging |
| REHAB-MD | NYU Grossman School of Medicine | 4 | REHAB-MD 4006 Physical Medicine and Rehabilitation |
| SURG-MD | NYU Grossman School of Medicine | 20 | SURG-MD 3003 Pediatric Surgery Selective |
| URO-MD | NYU Grossman School of Medicine | 3 | URO-MD 4004 Urology |

### NYU Shanghai  
_49 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ARBC-SHU | NYU Shanghai | 2 | ARBC-SHU 101 Elementary Arabic I |
| ART-SHU | NYU Shanghai | 36 | ART-SHU 101 What is Art? |
| BIOL-SHU | NYU Shanghai | 16 | BIOL-SHU 5 Nutrition, Fitness and Health |
| BPEP-SHU | NYU Shanghai | 1 | BPEP-SHU 9042 The Political Economy of East Asia |
| BUSF-SHU | NYU Shanghai | 61 | BUSF-SHU 3 Business and Economics Honors Seminar |
| CCCF-SHU | NYU Shanghai | 31 | CCCF-SHU 101W1 Perspectives on the Humanities: Beyond Nature |
| CCEX-SHU | NYU Shanghai | 10 | CCEX-SHU 1 Principles of Life-From Cells to Organisms |
| CCSF-SHU | NYU Shanghai | 1 | CCSF-SHU 101L Global Perspectives on Society |
| CCST-SHU | NYU Shanghai | 2 | CCST-SHU 133 Water Energy Food Nexus |
| CEL-SHU | NYU Shanghai | 2 | CEL-SHU 101E Topics in Service Learning: Public Science Education in China |
| CENG-SHU | NYU Shanghai | 6 | CENG-SHU 201 Digital Logic |
| CHEM-SHU | NYU Shanghai | 16 | CHEM-SHU 125 Foundations of Chemistry I |
| CHIN-SHU | NYU Shanghai | 50 | CHIN-SHU 10 Chinese Bridge Online-Elementary Level |
| CRWR-SHU | NYU Shanghai | 17 | CRWR-SHU 159 Introduction to Creative Writing |
| CSCI-SHU | NYU Shanghai | 25 | CSCI-SHU 11 Introduction to Computer Programming |
| DATS-SHU | NYU Shanghai | 8 | DATS-SHU 200 Topics in Machine Learning |
| EAP-SHU | NYU Shanghai | 42 | EAP-SHU 100 English for Academic Purposes I |
| ECON-SHU | NYU Shanghai | 38 | ECON-SHU 1 Principles of Macroeconomics |
| EENG-SHU | NYU Shanghai | 3 | EENG-SHU 251 Circuits |
| ENGD-SHU | NYU Shanghai | 2 | ENGD-SHU 101A Deans' Service Scholars: Language & Power |
| EXLI-SHU | NYU Shanghai | 2 | EXLI-SHU 9301 CITY AS TEXT |
| FREN-SHU | NYU Shanghai | 8 | FREN-SHU 1 Elementary French I |
| GCHN-SHU | NYU Shanghai | 52 | GCHN-SHU 101 Introduction to Chinese Civilization |
| GLBL-SHU | NYU Shanghai | 1 | GLBL-SHU 10 NYU Shanghai Reality Show: Musical Writing, Production, and Performance |
| HIST-SHU | NYU Shanghai | 28 | HIST-SHU 101 What is History |
| HUMN-SHU | NYU Shanghai | 31 | HUMN-SHU 101 What is Literature? |
| IDIS-SHU | NYU Shanghai | 1 | IDIS-SHU 997 Independent Study - Interdisciplinary |
| IMBX-SHU | NYU Shanghai | 27 | IMBX-SHU 1 Design Your NYU Shanghai |
| INTM-SHU | NYU Shanghai | 89 | INTM-SHU 101 Interaction Lab |
| JAPN-SHU | NYU Shanghai | 6 | JAPN-SHU 5 Elementary Japanese I |
| JOUR-SHU | NYU Shanghai | 4 | JOUR-SHU 201T Mixed Media Writing: Radio and Television |
| KORE-SHU | NYU Shanghai | 3 | KORE-SHU 5 Elementary Korean I |
| LIT-SHU | NYU Shanghai | 1 | LIT-SHU 200 Topics in Literature: |
| MATH-SHU | NYU Shanghai | 40 | MATH-SHU 5 Chance |
| MGMT-SHU | NYU Shanghai | 5 | MGMT-SHU 4 Global Strategy |
| MKTG-SHU | NYU Shanghai | 13 | MKTG-SHU 1 Introduction to Marketing |
| MUS-SHU | NYU Shanghai | 34 | MUS-SHU 56 Piano (Private Lessons) |
| NEUR-SHU | NYU Shanghai | 18 | NEUR-SHU 10 Free Will and the Brain |
| NYU-SHU | NYU Shanghai | 2 | NYU-SHU 101 Approaching China |
| PCIX-SHU | NYU Shanghai | 8 | PCIX-SHU 101 Creativity Considered |
| PHIL-SHU | NYU Shanghai | 21 | PHIL-SHU 70 Logic |
| PHYS-SHU | NYU Shanghai | 19 | PHYS-SHU 11 General Physics I |
| PSYC-SHU | NYU Shanghai | 16 | PSYC-SHU 101 Introduction to Psychology |
| SAS-SHU | NYU Shanghai | 1 | SAS-SHU 100 China in the Headlines |
| SDHM-SHU | NYU Shanghai | 1 | SDHM-SHU 410 Self-Designed Honors Major Capstone Seminar |
| SOCS-SHU | NYU Shanghai | 103 | SOCS-SHU 101T Topics in Psychology: Human Nature and Genocide: A case study in critical social psychology |
| SOIM-SHU | NYU Shanghai | 2 | SOIM-SHU 65 Organizational Communication and Its Social Context |
| SPAN-SHU | NYU Shanghai | 8 | SPAN-SHU 1 Elementary Spanish I |
| WRIT-SHU | NYU Shanghai | 6 | WRIT-SHU 101 Writing as Inquiry: WI |

### Robert F. Wagner Graduate School of Public Service  
_12 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| CAP-GP | Robert F. Wagner Graduate School of Public Service | 14 | CAP-GP 3148 Capstone: Advanced Research Projects in Quantitative Analysis I |
| CORE-GP | Robert F. Wagner Graduate School of Public Service | 5 | CORE-GP 1011 Statistical Methods |
| EXEC-GP | Robert F. Wagner Graduate School of Public Service | 19 | EXEC-GP 100 EMPA Co-Curricular Series |
| HPAM-GP | Robert F. Wagner Graduate School of Public Service | 23 | HPAM-GP 1830 Introduction to Health Policy and Management |
| INDEP-GP | Robert F. Wagner Graduate School of Public Service | 1 | INDEP-GP 1900 Independent Reading |
| MHA-GP | Robert F. Wagner Graduate School of Public Service | 23 | MHA-GP 1811 Managing Healthcare Organizations |
| MSPP-GP | Robert F. Wagner Graduate School of Public Service | 10 | MSPP-GP 1000 Methods and Microeconomics Intensive |
| NONCR-GP | Robert F. Wagner Graduate School of Public Service | 11 | NONCR-GP 100 Jump-starting the Wagner Classroom Experience |
| PADM-GP | Robert F. Wagner Graduate School of Public Service | 105 | PADM-GP 1801 Communication Skills for Public Service |
| PHD-GP | Robert F. Wagner Graduate School of Public Service | 8 | PHD-GP 5901 Research in Progress |
| UPADM-GP | Robert F. Wagner Graduate School of Public Service | 32 | UPADM-GP 101 The Politics of Public Policy |
| URPL-GP | Robert F. Wagner Graduate School of Public Service | 35 | URPL-GP 1603 Urban Planning Methods and Practice |

### Rory Meyers College of Nursing  
_2 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| NURSE-GN | Rory Meyers College of Nursing | 138 | NURSE-GN 2005 Intro Stats Health Profs |
| NURSE-UN | Rory Meyers College of Nursing | 61 | NURSE-UN 4 Nursing Cohort Seminar |

### School of Global Public Health  
_2 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| GPH-GU | School of Global Public Health | 234 | GPH-GU 1005 Advanced Introduction to Bioethics |
| UGPH-GU | School of Global Public Health | 31 | UGPH-GU 10 Health and Society in a Global Context |

### School of Law  
_3 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| LAW-LW | School of Law | 766 | LAW-LW 10007 Accounting for Lawyers |
| LAWH-LW | School of Law | 13 | LAWH-LW 10001 MSHLS:Understanding the Legal Environment: US and International Perspectives |
| LAWT-LW | School of Law | 14 | LAWT-LW 10000 MSCRS: Introduction to US Law |

### School of Professional Studies  
_76 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ADAV1-UC | School of Professional Studies | 9 | ADAV1-UC 1000 Applied Data Analytics I |
| AECE2-CS *[manually assigned]* | School of Professional Studies | 34 | AECE2-CS 2000 The Dollars and Sense of Designing Green |
| AENR1-UC | School of Professional Studies | 3 | AENR1-UC 9225 Writing Skills Seminar |
| ANTH1-UC | School of Professional Studies | 14 | ANTH1-UC 5003 Cultural Anthropology |
| ARTH1-UC | School of Professional Studies | 11 | ARTH1-UC 5416 Early Medieval Art & Architecture |
| ARTS1-UC | School of Professional Studies | 10 | ARTS1-UC 5411 The Arts: Jazz |
| ARTS2-CS *[manually assigned]* | School of Professional Studies | 1 | ARTS2-CS 9003 Historical Architecture of Lower Manhattan |
| BUSN1-UC | School of Professional Studies | 8 | BUSN1-UC 142 Principles of Accounting |
| CELP2-CS *[manually assigned]* | School of Professional Studies | 47 | CELP2-CS 8000 Careers in Data Science and Business Analytics |
| COMM2-CS *[manually assigned]* | School of Professional Studies | 6 | COMM2-CS 1000 Career Advancement for Introverts |
| CONM1-GC | School of Professional Studies | 17 | CONM1-GC 1015 Construction Cost Estimating |
| CWRG1-UC | School of Professional Studies | 13 | CWRG1-UC 5240 Foundations of The Creative Process |
| DEVE1-GC | School of Professional Studies | 41 | DEVE1-GC 1010 Land Use & Environmental Regulation |
| DFLM2-CS *[manually assigned]* | School of Professional Studies | 1 | DFLM2-CS 9913 NYU-SCPS at DOC NYC |
| DGCM1-UC | School of Professional Studies | 24 | DGCM1-UC 312 Content Strategy CX for Digital Media |
| ECOC1-GC | School of Professional Studies | 12 | ECOC1-GC 1000 Immersion Fundamentals Residency |
| ECON1-UC | School of Professional Studies | 28 | ECON1-UC 301 Intro to Macroeconomics |
| EMSC1-GC | School of Professional Studies | 17 | EMSC1-GC 10 Developing and Driving Actionable Customer Insights |
| ESL-NI *[manually assigned]* | School of Professional Studies | 19 | ESL-NI 4003 Elementary Communication and Culture |
| EXPR1-UC | School of Professional Studies | 1 | EXPR1-UC 9801 Seminar in Experiential Learning |
| EXWR1-UC | School of Professional Studies | 3 | EXWR1-UC 7501 Introduction to Creative and Expository Writing |
| FDGR1-GC | School of Professional Studies | 2 | FDGR1-GC 3900 Independent Study |
| FILV1-UC | School of Professional Studies | 5 | FILV1-UC 2003 Digital Cinematography |
| FINA2-CS *[manually assigned]* | School of Professional Studies | 5 | FINA2-CS 303 HP 10bII Calculator Workshop: A Comprehensive Approach |
| GCOM1-GC | School of Professional Studies | 5 | GCOM1-GC 1030 Technologies |
| GLOB1-GC | School of Professional Studies | 125 | GLOB1-GC 1000 International Relations in The Post-Cold War Era |
| GLSP1-GC | School of Professional Studies | 11 | GLSP1-GC 1000 Foundations of Global Sport Management |
| GSCC1-GC | School of Professional Studies | 18 | GSCC1-GC 1005 Cyber Law |
| HCAT1-GC | School of Professional Studies | 14 | HCAT1-GC 1000 People and Organization Management |
| HEAL1-UC | School of Professional Studies | 23 | HEAL1-UC 1971 Independent Study |
| HIST1-UC | School of Professional Studies | 15 | HIST1-UC 5804 Renaissance to Revolutn |
| HRCM1-GC | School of Professional Studies | 40 | HRCM1-GC 1200 Managing in a Global Economy |
| HSAD-NI *[manually assigned]* | School of Professional Studies | 27 | HSAD-NI 102 Programming Web Design: Creativity Meets Technology |
| HUMN1-UC | School of Professional Studies | 7 | HUMN1-UC 6401 Critical Thinking |
| INST1-UC | School of Professional Studies | 3 | INST1-UC 2000 Introduction to International Studies |
| INTG1-GC | School of Professional Studies | 24 | INTG1-GC 1000 Integrated Marketing |
| ISMM1-UC | School of Professional Studies | 23 | ISMM1-UC 702 Database Design |
| LAIN1-UC | School of Professional Studies | 2 | LAIN1-UC 7942 Liberal Arts Internship |
| LITR1-UC | School of Professional Studies | 10 | LITR1-UC 6201 Contemporary Global Literature |
| LRMS1-UC | School of Professional Studies | 26 | LRMS1-UC 548 Human Resources Management Principles |
| MASY1-GC | School of Professional Studies | 57 | MASY1-GC 1015 Quantitative Methods for Business Analysis |
| MATH1-UC | School of Professional Studies | 7 | MATH1-UC 1101 Math I |
| MEST1-UC | School of Professional Studies | 21 | MEST1-UC 6005 Global Perspectives in Media |
| MKAN1-UC | School of Professional Studies | 9 | MKAN1-UC 5100 Cultural and Legal Implications of Digital Technology |
| MSEM1-GC | School of Professional Studies | 24 | MSEM1-GC 1000 Event Management Fundamentals |
| MSFP1-GC | School of Professional Studies | 15 | MSFP1-GC 1000 Financial Planning Analysis and Risk Management |
| MSPM1-GC | School of Professional Studies | 14 | MSPM1-GC 1000 Principles of Project Management |
| MULT2-CS *[manually assigned]* | School of Professional Studies | 1 | MULT2-CS 9110 Mac OS |
| NDES2-CS *[manually assigned]* | School of Professional Studies | 3 | NDES2-CS 9106 Instant Interior Design |
| ORBC1-UC | School of Professional Studies | 20 | ORBC1-UC 1301 Organizational Behavior |
| PHIL2-CS *[manually assigned]* | School of Professional Studies | 3 | PHIL2-CS 1049 Planned Giving |
| POLS1-UC | School of Professional Studies | 21 | POLS1-UC 6601 Comparative Politics |
| PRCC1-GC | School of Professional Studies | 25 | PRCC1-GC 1000 Theory, History & Practice of Public Relations |
| PSIN1-UC | School of Professional Studies | 2 | PSIN1-UC 7942 Professional Studies Internship |
| PSYC1-UC | School of Professional Studies | 20 | PSYC1-UC 6801 Intro to Psychology |
| PUBB1-GC | School of Professional Studies | 61 | PUBB1-GC 1005 Introduction to Book Publishing |
| PWRT1-GC | School of Professional Studies | 20 | PWRT1-GC 1000 Principles of Professional Writing |
| REAL1-GC | School of Professional Studies | 48 | REAL1-GC 1005 Principles of Real Estate Accounting and Taxation |
| REAL1-UC | School of Professional Studies | 19 | REAL1-UC 1001 Real Estate Principles |
| REBS1-UC | School of Professional Studies | 36 | REBS1-UC 1001 Real Estate Principles |
| RECL2-CS *[manually assigned]* | School of Professional Studies | 7 | RECL2-CS 71 Real Estate Finance |
| REFI2-CS *[manually assigned]* | School of Professional Studies | 5 | REFI2-CS 9701 What Everyone Should Know About Real Estate |
| RESB2-CS *[manually assigned]* | School of Professional Studies | 15 | RESB2-CS 57 Real Estate Investment and Development: Multifamily Projects and Deals |
| RWLD1-GC | School of Professional Studies | 7 | RWLD1-GC 1000 Internship |
| RWLD1-UC | School of Professional Studies | 7 | RWLD1-UC 100 The World of Work: Exploring Careers and Equity in Action |
| SCNC1-UC | School of Professional Studies | 8 | SCNC1-UC 1000 Where the City Meets the Sea |
| SOCS1-UC | School of Professional Studies | 6 | SOCS1-UC 2201 Oral Communications |
| SOCY1-UC | School of Professional Studies | 12 | SOCY1-UC 7200 Intro to Sociology |
| SUST1-UC | School of Professional Studies | 3 | SUST1-UC 2000 Environmental Activism in Global Perspective |
| TCHS1-GC | School of Professional Studies | 53 | TCHS1-GC 1005 Trends in Travel and Tourism |
| TCHT1-UC | School of Professional Studies | 71 | TCHT1-UC 1000 Tourism Impacts and Issues |
| TCSB1-GC | School of Professional Studies | 38 | TCSB1-GC 5 Industry & Business Principles |
| TCSM1-UC | School of Professional Studies | 63 | TCSM1-UC 1000 Introduction to Sports Management |
| TCTM1-GC | School of Professional Studies | 36 | TCTM1-GC 1015 Leadership |
| TRAN1-GC | School of Professional Studies | 42 | TRAN1-GC 1000 Theory and Practice of Translation |
| URBN1-UC | School of Professional Studies | 3 | URBN1-UC 2000 Introduction to GIS |

### Silver School of Social Work  
_7 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| DSWSW-GS | Silver School of Social Work | 30 | DSWSW-GS 4001 Philosophies of Knowledge and Mind |
| MSWAC-GS | Silver School of Social Work | 21 | MSWAC-GS 2001 Human Behavior in The Social Environment III |
| MSWEL-GS | Silver School of Social Work | 120 | MSWEL-GS 2003 Social Work & The Law |
| MSWFD-GS | Silver School of Social Work | 12 | MSWFD-GS 2100 Practicum Instruction I |
| MSWPF-GS | Silver School of Social Work | 10 | MSWPF-GS 2001 Social Work Practice I |
| PHDSW-GS | Silver School of Social Work | 25 | PHDSW-GS 3013 Dissertation Proseminar |
| UNDSW-US | Silver School of Social Work | 56 | UNDSW-US 1 Society and Social Welfare |

### Steinhardt School of Culture, Education, and Human Development  
_123 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ACE-UE | Steinhardt School of Culture, Education, and Human Development | 1 | ACE-UE 110 Advanced Writing and Research |
| AMLT-GE | Steinhardt School of Culture, Education, and Human Development | 7 | AMLT-GE 2053 Organizational Theory |
| APSTA-GE | Steinhardt School of Culture, Education, and Human Development | 38 | APSTA-GE 2001 Statistics for the Social and Behavioral Sciences I |
| APSTA-UE | Steinhardt School of Culture, Education, and Human Development | 7 | APSTA-UE 10 Statistical Mysteries and How to Solve Them |
| APSY-GE | Steinhardt School of Culture, Education, and Human Development | 111 | APSY-GE 2001 Neuropsychology of Behavior |
| APSY-UE | Steinhardt School of Culture, Education, and Human Development | 50 | APSY-UE 2 Introduction to Psychology and Its Principles |
| ARCS-GE | Steinhardt School of Culture, Education, and Human Development | 16 | ARCS-GE 2012 Literature & Methodology of Costume Studies |
| ARCS-UE | Steinhardt School of Culture, Education, and Human Development | 4 | ARCS-UE 1020 History of Fashion Photography |
| ART-GE | Steinhardt School of Culture, Education, and Human Development | 31 | ART-GE 2002 Intro to The Galleries & Museums of New York |
| ART-UE | Steinhardt School of Culture, Education, and Human Development | 78 | ART-UE 22 Interdisciplinary Art Practice I |
| ARTCR-GE | Steinhardt School of Culture, Education, and Human Development | 7 | ARTCR-GE 2151 History of Art Since 1945 |
| ARTCR-UE | Steinhardt School of Culture, Education, and Human Development | 10 | ARTCR-UE 10 Art: Practice & Ideas |
| ARTED-GE | Steinhardt School of Culture, Education, and Human Development | 13 | ARTED-GE 2000 Art Education Grd Colloquium & Sem |
| ARTP-GE | Steinhardt School of Culture, Education, and Human Development | 1 | ARTP-GE 2300 Independent Study |
| ARTP-UE | Steinhardt School of Culture, Education, and Human Development | 1 | ARTP-UE 1000 Independent Study |
| ARTT-GE | Steinhardt School of Culture, Education, and Human Development | 21 | ARTT-GE 2010 Introduction to Art Therapy |
| ARTT-NE *[manually assigned]* | Steinhardt School of Culture, Education, and Human Development | 2 | ARTT-NE 1002 High School Summer Art Intensive: Curating Fashion |
| ARTT-UE | Steinhardt School of Culture, Education, and Human Development | 1 | ARTT-UE 1010 Introduction to Art Therapy |
| ARVA-GE | Steinhardt School of Culture, Education, and Human Development | 41 | ARVA-GE 2000 Visual Arts Administration Colloquium |
| ASH-GE | Steinhardt School of Culture, Education, and Human Development | 5 | ASH-GE 2000 New Graduate Student Orientation Seminar |
| ASL-UE | Steinhardt School of Culture, Education, and Human Development | 6 | ASL-UE 91 American Sign Language I |
| BILED-GE | Steinhardt School of Culture, Education, and Human Development | 7 | BILED-GE 2001 Bilingual Multicultural Education: Theory and Practice |
| BILED-UE | Steinhardt School of Culture, Education, and Human Development | 1 | BILED-UE 1001 Bilingual Multicultural Education: Theory and Practice |
| CHDED-GE | Steinhardt School of Culture, Education, and Human Development | 5 | CHDED-GE 2011 Multicultural Perspect in Social Studies |
| CHDED-UE | Steinhardt School of Culture, Education, and Human Development | 10 | CHDED-UE 1000 Indepedent Study |
| CRTE-NE *[manually assigned]* | Steinhardt School of Culture, Education, and Human Development | 1 | CRTE-NE 1 Coding for Game Design |
| CSCD-GE | Steinhardt School of Culture, Education, and Human Development | 50 | CSCD-GE 1309 Lab-Based Research in CSD: Find Your Voice |
| CSCD-UE | Steinhardt School of Culture, Education, and Human Development | 24 | CSCD-UE 101 The Talking Brain: Typical and Disordered Communication |
| ECED-GE | Steinhardt School of Culture, Education, and Human Development | 4 | ECED-GE 2017 Human Development and Education |
| ECED-UE | Steinhardt School of Culture, Education, and Human Development | 9 | ECED-UE 1000 Ind Study |
| EDCT-GE | Steinhardt School of Culture, Education, and Human Development | 34 | EDCT-GE 2015 User Experience Design |
| EDCT-UE | Steinhardt School of Culture, Education, and Human Development | 3 | EDCT-UE 1010 Being Digital: How the Internet Works/Why It Is Important |
| EDLED-GE | Steinhardt School of Culture, Education, and Human Development | 43 | EDLED-GE 2005 Professional Seminar in Educational Leadership |
| EDLED-UE | Steinhardt School of Culture, Education, and Human Development | 1 | EDLED-UE 1005 Intro to Education Policy Analysis |
| EDPLY-GE | Steinhardt School of Culture, Education, and Human Development | 4 | EDPLY-GE 2030 Education and Social Policy |
| EDST-UE | Steinhardt School of Culture, Education, and Human Development | 10 | EDST-UE 1000 Independent Study |
| EJST-GE | Steinhardt School of Culture, Education, and Human Development | 1 | EJST-GE 2300 Independent Study |
| EMAT-GE | Steinhardt School of Culture, Education, and Human Development | 37 | EMAT-GE 2001 Who Are We and Where Do We Learn and Teach? |
| ENGED-GE | Steinhardt School of Culture, Education, and Human Development | 14 | ENGED-GE 2041 Teaching/Learning English Language Arts Middle & HS |
| ENGED-UE | Steinhardt School of Culture, Education, and Human Development | 10 | ENGED-UE 71 Lit as Exploration I |
| ENYC-GE | Steinhardt School of Culture, Education, and Human Development | 10 | ENYC-GE 2005 Cities and Their Environments |
| FOOD-GE | Steinhardt School of Culture, Education, and Human Development | 58 | FOOD-GE 2006 Food Entrepreneurship |
| FOOD-UE | Steinhardt School of Culture, Education, and Human Development | 35 | FOOD-UE 71 Fd Issues of Cont Societ |
| HPSE-GE | Steinhardt School of Culture, Education, and Human Development | 44 | HPSE-GE 2011 How Colleges Work |
| HPSE-UE | Steinhardt School of Culture, Education, and Human Development | 2 | HPSE-UE 12 Dean’s Sophomore Success Seminar |
| HSED-GE | Steinhardt School of Culture, Education, and Human Development | 4 | HSED-GE 2108 Finding Meaning and Purpose at the American University: A History |
| HSED-UE | Steinhardt School of Culture, Education, and Human Development | 11 | HSED-UE 175 Nativism, Walls, and Democracy |
| HUCC-GE | Steinhardt School of Culture, Education, and Human Development | 1 | HUCC-GE 2000 Hebrew Union College Consortium |
| INTE-GE | Steinhardt School of Culture, Education, and Human Development | 31 | INTE-GE 2007 Qualitative Methods in International Education |
| INTE-UE | Steinhardt School of Culture, Education, and Human Development | 7 | INTE-UE 10 Introduction to Global Education |
| IUCD-GE | Steinhardt School of Culture, Education, and Human Development | 1 | IUCD-GE 3000 Inter-University Doctoral Consortium |
| LANED-GE | Steinhardt School of Culture, Education, and Human Development | 17 | LANED-GE 2003 Linguistic Analysis |
| LITC-GE | Steinhardt School of Culture, Education, and Human Development | 10 | LITC-GE 2001 Foundations of Literacy Development in Childhood/Early Childhood |
| LITC-UE | Steinhardt School of Culture, Education, and Human Development | 4 | LITC-UE 1175 Language and Literacy for Young Children |
| MAINT-GE | Steinhardt School of Culture, Education, and Human Development | 1 | MAINT-GE 4747 Maintenance of Matriculation |
| MAINT-UE | Steinhardt School of Culture, Education, and Human Development | 1 | MAINT-UE 4747 Maintenance of Matriculation |
| MCC-GE | Steinhardt School of Culture, Education, and Human Development | 85 | MCC-GE 2001 Media, Culture and Communication Core |
| MCC-UE | Steinhardt School of Culture, Education, and Human Development | 136 | MCC-UE 1 Introduction to Media Studies |
| MPABR-GE | Steinhardt School of Culture, Education, and Human Development | 8 | MPABR-GE 2111 Brass Instemnt (Private Lessons) |
| MPABR-UE | Steinhardt School of Culture, Education, and Human Development | 8 | MPABR-UE 1000 Independent Study |
| MPADE-GE | Steinhardt School of Culture, Education, and Human Development | 39 | MPADE-GE 2006 Yoga and Pilates: Dynamic Alignment Principles |
| MPADE-UE | Steinhardt School of Culture, Education, and Human Development | 10 | MPADE-UE 12 Intro to Modern Dance |
| MPADT-GE | Steinhardt School of Culture, Education, and Human Development | 24 | MPADT-GE 2100 Introduction to Arts-Based Research |
| MPADT-UE | Steinhardt School of Culture, Education, and Human Development | 1 | MPADT-UE 1115 Can Art Save Lives? |
| MPAET-GE | Steinhardt School of Culture, Education, and Human Development | 63 | MPAET-GE 2005 Intro to Theatre for Young and Audiences I |
| MPAET-UE | Steinhardt School of Culture, Education, and Human Development | 27 | MPAET-UE 9 Stagecraft |
| MPAGC-GE | Steinhardt School of Culture, Education, and Human Development | 2 | MPAGC-GE 2087 NYU Orchestra |
| MPAGC-UE | Steinhardt School of Culture, Education, and Human Development | 2 | MPAGC-UE 1087 NYU Orchestra |
| MPAIA-GE | Steinhardt School of Culture, Education, and Human Development | 5 | MPAIA-GE 2010 Human Dev/Ed in Arts |
| MPAIA-UE | Steinhardt School of Culture, Education, and Human Development | 2 | MPAIA-UE 1053 Intg Art Erly Chld Cur I |
| MPAJZ-GE | Steinhardt School of Culture, Education, and Human Development | 12 | MPAJZ-GE 2000 Graduate Jazz Seminar |
| MPAJZ-UE | Steinhardt School of Culture, Education, and Human Development | 27 | MPAJZ-UE 41 Guitar (Group) for Non-Majors |
| MPAMB-GE | Steinhardt School of Culture, Education, and Human Development | 18 | MPAMB-GE 2001 Music Business Graduate Prof Develpmnt Sequence |
| MPAMB-UE | Steinhardt School of Culture, Education, and Human Development | 24 | MPAMB-UE 100 Business Structure of The Music Industry |
| MPAME-GE | Steinhardt School of Culture, Education, and Human Development | 22 | MPAME-GE 2010 Current Readings in Music Education |
| MPAME-UE | Steinhardt School of Culture, Education, and Human Development | 24 | MPAME-UE 83 NYU Wind Symphony: |
| MPAMT-GE | Steinhardt School of Culture, Education, and Human Development | 26 | MPAMT-GE 2000 Music Therapy Colloqium |
| MPAMT-UE | Steinhardt School of Culture, Education, and Human Development | 1 | MPAMT-UE 1046 Intro Music Therapy |
| MPAP-NE *[manually assigned]* | Steinhardt School of Culture, Education, and Human Development | 1 | MPAP-NE 9500 Kodaly Summer Institute-Hungary |
| MPAPA-GE | Steinhardt School of Culture, Education, and Human Development | 21 | MPAPA-GE 2001 Internship Performing Arts Admin I |
| MPAPA-UE | Steinhardt School of Culture, Education, and Human Development | 1 | MPAPA-UE 1000 Introduction to Performing Arts Administration |
| MPAPE-GE | Steinhardt School of Culture, Education, and Human Development | 11 | MPAPE-GE 2026 Colloquy in Music |
| MPAPE-UE | Steinhardt School of Culture, Education, and Human Development | 18 | MPAPE-UE 56 Piano (Private Lessons) for Non-Majors |
| MPAPS-GE | Steinhardt School of Culture, Education, and Human Development | 8 | MPAPS-GE 2111 Percussion Instrmnt (Private Lessons |
| MPAPS-UE | Steinhardt School of Culture, Education, and Human Development | 10 | MPAPS-UE 1000 Independent Study |
| MPASS-GE | Steinhardt School of Culture, Education, and Human Development | 29 | MPASS-GE 2111 Stringed Instruments (Private Lessons) |
| MPASS-UE | Steinhardt School of Culture, Education, and Human Development | 32 | MPASS-UE 1000 Independent Study |
| MPATC-GE | Steinhardt School of Culture, Education, and Human Development | 65 | MPATC-GE 2018 16th-Century Counterpoint |
| MPATC-UE | Steinhardt School of Culture, Education, and Human Development | 100 | MPATC-UE 16 String Pract:Composers |
| MPATE-GE | Steinhardt School of Culture, Education, and Human Development | 52 | MPATE-GE 2013 Audio Mastering |
| MPATE-UE | Steinhardt School of Culture, Education, and Human Development | 35 | MPATE-UE 92 Collegium and Program Seminar |
| MPAVP-GE | Steinhardt School of Culture, Education, and Human Development | 43 | MPAVP-GE 2111 Vocal Training (Private Lessons) |
| MPAVP-UE | Steinhardt School of Culture, Education, and Human Development | 52 | MPAVP-UE 1000 Independent Study |
| MPAWW-GE | Steinhardt School of Culture, Education, and Human Development | 16 | MPAWW-GE 2083 NYU Wind Symphony: |
| MPAWW-UE | Steinhardt School of Culture, Education, and Human Development | 14 | MPAWW-UE 1083 NYU Wind Symphony: |
| MTHED-GE | Steinhardt School of Culture, Education, and Human Development | 19 | MTHED-GE 2031 The Teaching of Rational Numbers |
| MTHED-UE | Steinhardt School of Culture, Education, and Human Development | 20 | MTHED-UE 1000 Independent Study |
| MTRO-NE *[manually assigned]* | Steinhardt School of Culture, Education, and Human Development | 1 | MTRO-NE 8 NYU Liberty Partners |
| NUTR-GE | Steinhardt School of Culture, Education, and Human Development | 43 | NUTR-GE 2000 Nutrition: New Graduate Student Seminar |
| NUTR-UE | Steinhardt School of Culture, Education, and Human Development | 21 | NUTR-UE 85 Intro to Foods and Food Science |
| OT-GE | Steinhardt School of Culture, Education, and Human Development | 75 | OT-GE 2000 New Student Seminar in Occupational Therapy |
| OT-UE | Steinhardt School of Culture, Education, and Human Development | 7 | OT-UE 1 Orientation to O.T. |
| PHED-GE | Steinhardt School of Culture, Education, and Human Development | 1 | PHED-GE 2160 The Quest for Meaning in Higher Education |
| PHED-UE | Steinhardt School of Culture, Education, and Human Development | 3 | PHED-UE 10 Learning and The Meaning of Life |
| PT-GE | Steinhardt School of Culture, Education, and Human Development | 65 | PT-GE 2004 Histology General Path |
| REHAB-GE | Steinhardt School of Culture, Education, and Human Development | 2 | REHAB-GE 3005 Transdisciplinary Patient Based Managment |
| RESCH-GE | Steinhardt School of Culture, Education, and Human Development | 10 | RESCH-GE 2140 Approaches to Qualitative Inquiry |
| SAHS-GE | Steinhardt School of Culture, Education, and Human Development | 2 | SAHS-GE 2003 New Graduate Student Seminar for International Students |
| SAHS-UE | Steinhardt School of Culture, Education, and Human Development | 5 | SAHS-UE 1 New Student Seminar |
| SCIED-GE | Steinhardt School of Culture, Education, and Human Development | 11 | SCIED-GE 2009 Science Experiences in The Elementary School I |
| SCIED-UE | Steinhardt School of Culture, Education, and Human Development | 14 | SCIED-UE 210 Science in Our Lives: Science in the Community |
| SCMTH-GE | Steinhardt School of Culture, Education, and Human Development | 1 | SCMTH-GE 2002 Research Internship in SCI/Math |
| SOCED-GE | Steinhardt School of Culture, Education, and Human Development | 8 | SOCED-GE 2042 Teaching Soc Std in The Middle/Secondary Sch |
| SOCED-UE | Steinhardt School of Culture, Education, and Human Development | 10 | SOCED-UE 1000 Ind Study |
| SOED-GE | Steinhardt School of Culture, Education, and Human Development | 11 | SOED-GE 2002 Sociology of Education |
| SOED-UE | Steinhardt School of Culture, Education, and Human Development | 1 | SOED-UE 1015 Educ as Soc Institution |
| SPCED-GE | Steinhardt School of Culture, Education, and Human Development | 19 | SPCED-GE 2051 Fnds of Curr for Diverse Learners |
| SPCED-UE | Steinhardt School of Culture, Education, and Human Development | 16 | SPCED-UE 83 Foundations of Spec Educ |
| TCHL-GE | Steinhardt School of Culture, Education, and Human Development | 17 | TCHL-GE 2000 Field Consultation |
| TCHL-UE | Steinhardt School of Culture, Education, and Human Development | 16 | TCHL-UE 1 Inquiries Into Teaching & Learning I |
| TESOL-GE | Steinhardt School of Culture, Education, and Human Development | 9 | TESOL-GE 2002 Teaching Second Language Theory & Practice |
| TESOL-UE | Steinhardt School of Culture, Education, and Human Development | 1 | TESOL-UE 1204 Teaching Second Language Across Content Areas |
| WLGED-UE | Steinhardt School of Culture, Education, and Human Development | 3 | WLGED-UE 1911 Student Teaching World Language Education: Middle/High School I |

### Tandon School of Engineering  
_53 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| AE-UY | Tandon School of Engineering | 4 | AE-UY 4603 Compressible Flow |
| BE-GY | Tandon School of Engineering | 31 | BE-GY 871X Guided Studies in Biomedical Engineering |
| BI-GY | Tandon School of Engineering | 16 | BI-GY 810X Bioinformatics Capstone |
| BMS-UY | Tandon School of Engineering | 25 | BMS-UY 471X Guided Studies in Biomolecular Science |
| BT-GY | Tandon School of Engineering | 16 | BT-GY 871X Project in Biotechnology |
| BTE-GY | Tandon School of Engineering | 7 | BTE-GY 950X Project in Biotechnology and Entrepreneurship |
| CAM-UY | Tandon School of Engineering | 8 | CAM-UY 2012 Technology and Social Media: Identity and Development in Children and Young Adults |
| CBE-GY | Tandon School of Engineering | 12 | CBE-GY 902X Guided Studies in Chemical Engineering |
| CBE-UY | Tandon School of Engineering | 20 | CBE-UY 481X Chemical Engineering Project |
| CE-GY | Tandon School of Engineering | 79 | CE-GY 804 Forecasting Urban Travel Demand |
| CE-UY | Tandon School of Engineering | 56 | CE-UY 496X Undergraduate Research Project in Civil and Urban Engineering |
| CM-GY | Tandon School of Engineering | 6 | CM-GY 997X MS THESIS IN CHEMISTRY |
| CM-UY | Tandon School of Engineering | 20 | CM-UY 1001 General Chemistry for Engineers Laboratory |
| CP-GY | Tandon School of Engineering | 6 | CP-GY 9911 Internship for MS I |
| CP-UY | Tandon School of Engineering | 7 | CP-UY 200X Experiential Learning Seminar |
| CS-GY | Tandon School of Engineering | 39 | CS-GY 997X MS Thesis in Computer Science |
| CS-UY | Tandon School of Engineering | 40 | CS-UY 394X Special Topics in Computer Science |
| CUSP-GX *[manually assigned]* | Tandon School of Engineering | 41 | CUSP-GX 900X Guided Studies |
| DM-GY | Tandon School of Engineering | 30 | DM-GY 910X Special Topics in Digital Media |
| DM-UY | Tandon School of Engineering | 31 | DM-UY 492X Independent Study in Design & Media |
| ECE-GY | Tandon School of Engineering | 83 | ECE-GY 997X MS Thesis in Electrical & Computer Engineering Department |
| ECE-UY | Tandon School of Engineering | 39 | ECE-UY 345X Undergraduate Research in Electrical and Computer Engineering |
| EG-UY | Tandon School of Engineering | 4 | EG-UY 1001 Engineering and Technology Forum |
| EN-UY | Tandon School of Engineering | 17 | EN-UY 2114W Poetry as Structure and Design |
| ENGR-NY *[manually assigned]* | Tandon School of Engineering | 2 | ENGR-NY 24 Summer Program for Automation Robotics and Coding |
| FIN-UY | Tandon School of Engineering | 7 | FIN-UY 2003 Economic Foundations of Finance |
| FRE-GY | Tandon School of Engineering | 69 | FRE-GY 5000 FRE Recitation |
| GA-GY | Tandon School of Engineering | 3 | GA-GY 8003 Global Perspectives in Emerging Technology |
| HI-UY | Tandon School of Engineering | 4 | HI-UY 2514 Introduction to New York City History |
| IE-GY | Tandon School of Engineering | 11 | IE-GY 6063 Work Design and Measurement |
| MA-GY | Tandon School of Engineering | 11 | MA-GY 942X Reading in Mathematics II |
| MA-UY | Tandon School of Engineering | 47 | MA-UY 492X Independent Study |
| MD-UY | Tandon School of Engineering | 3 | MD-UY 2164 History and Social Impact of Mass Media Communications |
| ME-GY | Tandon School of Engineering | 43 | ME-GY 996X MS Project |
| ME-UY | Tandon School of Engineering | 40 | ME-UY 498X Special Topics in Mechanical Engineering |
| MG-GY | Tandon School of Engineering | 54 | MG-GY 999X PhD Dissertation in Technology Management |
| MG-UY | Tandon School of Engineering | 29 | MG-UY 444X Guided Studies in Business and Technology Management |
| MN-GY | Tandon School of Engineering | 1 | MN-GY 7883 Manufacturing Systems Engineering |
| PH-GY | Tandon School of Engineering | 17 | PH-GY 955X Readings in Applied Physics |
| PH-UY | Tandon School of Engineering | 39 | PH-UY 1002 Physics: The Genesis of Technology |
| PHP-UY | Tandon School of Engineering | 2 | PHP-UY 1000 Introduction to Prehealth: Healthcare Fields, Requirements, & Resources |
| PS-UY | Tandon School of Engineering | 4 | PS-UY 2324W Environmental Psychology |
| RE-GY | Tandon School of Engineering | 1 | RE-GY 9990 PHD QUALIFYING EXAM |
| ROB-GY | Tandon School of Engineering | 15 | ROB-GY 996X MS Project |
| ROB-UY | Tandon School of Engineering | 5 | ROB-UY 2004 Robotic Manipulation and Locomotion |
| SEG-UY | Tandon School of Engineering | 1 | SEG-UY 4504 Advanced Seminar in Society, Envirnmnt, & Globaliz |
| STS-UY | Tandon School of Engineering | 49 | STS-UY 1002 Introduction to Science and Technology Studies |
| TCS-UY | Tandon School of Engineering | 3 | TCS-UY 2122 Public Problem Solving |
| TR-GY | Tandon School of Engineering | 20 | TR-GY 900X Readings in Transportation |
| UGA-UY | Tandon School of Engineering | 3 | UGA-UY 2000 Global Leaders and Scholars in STEM (GLASS) Sophomore Seminar |
| URB-UY | Tandon School of Engineering | 26 | URB-UY 391X Independent Study in SUE |
| VIP-GY | Tandon School of Engineering | 2 | VIP-GY 5000 Vertically Integrated Projects |
| VIP-UY | Tandon School of Engineering | 2 | VIP-UY 300X Vertically Integrated Projects |

### Tisch School of the Arts  
_39 prefixes_

| Prefix | School | Course count | Example |
| --- | --- | ---: | --- |
| ACTG-GT | Tisch School of the Arts | 20 | ACTG-GT 1002 Production Crew/Act |
| ASPP-GT | Tisch School of the Arts | 26 | ASPP-GT 2000 All School Seminar: |
| ASPP-UT | Tisch School of the Arts | 23 | ASPP-UT 2 The World Through Art Writing The Essay |
| CINE-GT | Tisch School of the Arts | 80 | CINE-GT 1010 Film Form/Film Sense: Industries & Aesthetics |
| CINE-UT | Tisch School of the Arts | 58 | CINE-UT 10 Intro to Cinema Studies |
| COART-UT | Tisch School of the Arts | 86 | COART-UT 1 Jam House |
| DANC-GT | Tisch School of the Arts | 28 | DANC-GT 2000 Dance Im |
| DANC-UT | Tisch School of the Arts | 42 | DANC-UT 5 Dance I |
| DESG-GT | Tisch School of the Arts | 76 | DESG-GT 1000 Costume Studio I |
| DWPG-GT | Tisch School of the Arts | 37 | DWPG-GT 2000 Art & Public Policy All School Seminar: |
| DWPG-UT | Tisch School of the Arts | 39 | DWPG-UT 15 Summer Screenwriting |
| FMTV-UT | Tisch School of the Arts | 150 | FMTV-UT 4 The Language of Film |
| GAMES-GT | Tisch School of the Arts | 68 | GAMES-GT 101 Games 101 |
| GAMES-UT | Tisch School of the Arts | 65 | GAMES-UT 101 Games 101 |
| GFMTV-GT | Tisch School of the Arts | 70 | GFMTV-GT 2000 First Year Colloquium |
| GMTW-GT | Tisch School of the Arts | 28 | GMTW-GT 1001 Writing Workshop I - Part I |
| GMTW-UT | Tisch School of the Arts | 1 | GMTW-UT 1002 The American Musical |
| ICINE-UT | Tisch School of the Arts | 5 | ICINE-UT 12 British Cinema |
| IDWPG-UT | Tisch School of the Arts | 4 | IDWPG-UT 1049 INTERMEDIATE PLAYWRITING |
| IFMTV-UT | Tisch School of the Arts | 9 | IFMTV-UT 81 Tisch Goes Hollywood |
| IMALR-GT | Tisch School of the Arts | 38 | IMALR-GT 101 Concepts, Culture & Communications |
| IMNY-UT | Tisch School of the Arts | 65 | IMNY-UT 1 Code! |
| IPHTI-UT | Tisch School of the Arts | 4 | IPHTI-UT 1 Photography & Imaging Digital |
| ITHEA-UT | Tisch School of the Arts | 3 | ITHEA-UT 70 Shakespeare and the Elizabethan Stage: Text and Performance |
| ITPG-GT | Tisch School of the Arts | 274 | ITPG-GT 1000 Creative Computing |
| NCRD-GT | Tisch School of the Arts | 1 | NCRD-GT 7001 Sight and Sound Workshop |
| NCRD-UT | Tisch School of the Arts | 64 | NCRD-UT 4 Language of Film |
| OART-GT | Tisch School of the Arts | 38 | OART-GT 2011 Analog Photography |
| OART-UT | Tisch School of the Arts | 160 | OART-UT 10 The Art of Make Up for Film & Television |
| PERF-GT | Tisch School of the Arts | 7 | PERF-GT 1000 Introduction to Performance Studies |
| PERF-UT | Tisch School of the Arts | 18 | PERF-UT 101 Introduction to Performance Studies |
| PHTI-GT | Tisch School of the Arts | 7 | PHTI-GT 2001 Photography I |
| PHTI-UT | Tisch School of the Arts | 34 | PHTI-UT 1 Photography & Imaging Digital |
| PROD-GT | Tisch School of the Arts | 13 | PROD-GT 2001 Producing Essentials |
| REMU-UT | Tisch School of the Arts | 149 | REMU-UT 1 Professional Development: Creativity in Context |
| SFMTV-UT | Tisch School of the Arts | 1 | SFMTV-UT 80 Sight and Sound: Documentary |
| SPEC-UT | Tisch School of the Arts | 3 | SPEC-UT 81 Tisch Goes Coast to Coast |
| THEA-UT | Tisch School of the Arts | 115 | THEA-UT 120 Intimacy in Performance |
| VRTP-GT | Tisch School of the Arts | 10 | VRTP-GT 2001 Introduction to Virtual Production |

### Still unassigned after manual investigation

_None._ The 31 prefixes the scrape left unassigned were all resolved via site-search of `bulletins.nyu.edu` plus inspection of the per-course grading labels ("Ugrd Abu Dhabi Graded", "SPS Non-Credit Graded", "Grad Stern", etc.). The manually-assigned rows above are flagged with *[manually assigned]* in the Prefix column so future contributors can tell which rows came from the scrape vs. from the patching pass.

---

## 2. Catalog-number suffix patterns

"Suffix" = the trailing non-digit characters of a catalog number, e.g. `410X` → `X`, `1134G` → `G`, `2204` → (none). The parser's `catalog_number_full` field preserves the suffix verbatim; suffixes do not change parsing behavior, only downstream rendering and filtering.

**Parser rule (applies to every row below):** the suffix is captured as a trailing `[A-Z]{0,2}` substring after the digits and preserved on `section.catalog_number` / `course.catalog_number`. The parser does not branch on any suffix value.

| Suffix | Count | Subjects observed | Example | Parser note |
| --- | ---: | --- | --- | --- |
| (none) | 18,338 | essentially all 685 prefixes | `PHIL-UA 1 Central Problems in Philosophy` | Standard numbering. No suffix. |
| `X` | 123 | widely spread across UH / UY / GY / GX campuses (49 prefixes) | `ACS-UH 1010X Anthropology and the Arab World` | Variable-topic / by-arrangement section. Topic title usually follows in an Albert paste's "Topic:" line (not yet parsed). |
| `J` | 107 | `CCOL-UH`, `EAP-SHU` | `CCOL-UH 2002J Just Cash: ...` | January-term offering. Parser preserves verbatim. |
| `Q` | 40 | NYUAD core-family prefixes (`CCOL-UH`, `CDAD-UH`, `CSTS-UH`, `ENGR-UH`, `MATH-UH`, `POLSC-UH`, `PSYCH-UH`, `SCIEN-UH`, `SOCSC-UH`, `EAP-SHU`) | `CCOL-UH 1015Q Labor` | NYUAD "Quantitative Reasoning" designator. Preserved opaquely. |
| `EQ` | 36 | `CADT-UH`, `CCOL-UH`, `CDAD-UH`, `CSTS-UH`, `ECON-UH`, `PSYCH-UH`, `SCIEN-UH` | `CADT-UH 1008EQ Touch` | NYUAD capstone designator (Experimental + Quantitative, per current best guess). Preserved opaquely — the parser does not split `E` from `Q`. |
| `G` | 33 | mixed UH / UY / SHU (15 prefixes) | `BUSF-SHU 200G Experiential Mediation`, `CS-UY 1134G ...` | Global-site / graduate variant. **Important for cross-listing**: some Tandon courses appear in two forms (`CS-UY 1134` and `CS-UY 1134G`). Parser treats them as separate catalog numbers; a higher-layer heuristic would collapse them. See section 5, Known gaps. |
| `W` | 26 | Tandon undergrad (`CAM-UY`, `EN-UY`, `HI-UY`, `PS-UY`, `STS-UY`, `URB-UY`) + `EAP-SHU` | `CAM-UY 2014W STEM & Theater` | Writing-intensive designator. |
| `T` | 17 | Shanghai prefixes (`BUSF-SHU`, `CRWR-SHU`, `EAP-SHU`, `INTM-SHU`, `JOUR-SHU`, `MATH-SHU`, `SOCS-SHU`) | `BUSF-SHU 209T Senior Theses ...` | Shanghai thesis / topic designator. |
| `A` | 14 | Shanghai (`ART-SHU`, `BUSF-SHU`, `CHIN-SHU`, `EAP-SHU`, `ENGD-SHU`, `GCHN-SHU`, `HUMN-SHU`) | `ART-SHU 225A Contemporary Dance` | Multi-part series (see also `B`, `C`, `D`). Preserved opaquely — not a prefix of `AQ`/`AS` which have their own rows. |
| `E` | 13 | UH + SHU mix | `CADT-UH 1016E Utilitas, Venustas, Firmitas` | Experimental / elective designator. |
| `S` | 9 | `CHIN-SHU`, `EAP-SHU`, `ENGL-UA`, `ENVST-UA` | `CHIN-SHU 101S Elementary Chinese I - FoS1` | Shanghai "FoS" / seminar marker. |
| `L` | 7 | Shanghai labs + `DHYG1-UD`, `EAP-SHU` | `DHYG1-UD 114L Anatomy & Physiology I Lab` | Lab-coupled companion to a lecture section. |
| `B` | 6 | Shanghai | `ART-SHU 225B Contemporary Dance` | Second part of a multi-part series. |
| `D` | 4 | `BUSF-SHU`, `EAP-SHU`, `INTM-SHU` | `BUSF-SHU 200D Business Consulting in China` | Fourth part / variant. |
| `C` | 3 | `EAP-SHU`, `INTM-SHU`, `SCIEN-UH` | `EAP-SHU 101C Intercultural Communication` | Third part / variant. |
| `F` | 3 | `BUSF-SHU`, `EAP-SHU` | `BUSF-SHU 200F Fixed Income Derivatives` | Variant (Fixed Income, in the BUSF case). |
| `P` | 3 | `EAP-SHU`, `SCIEN-UH` | `SCIEN-UH 1124P Foundations of Science 1 Lab: Physics` | Physics-lab variant (in SCIEN-UH) / topic variant elsewhere. |
| `BE` | 2 | `SCIEN-UH` | `SCIEN-UH 1344BE Foundations of Science 4 Lab: Biology` | NYUAD FoS lab designator (Biology-Extended). Two-letter suffix — parser accepts. |
| `H` | 2 | `EAP-SHU` | `EAP-SHU 100H EAP: Smart Cities/Smart Lifestyles` | SHU topic variant. |
| `I` | 2 | `EAP-SHU` | `EAP-SHU 100I EAP: Understanding the News` | SHU topic variant. |
| `V` | 2 | `EAP-SHU` | `EAP-SHU 100V The Science of Friendship` | SHU topic variant. |
| `AQ` | 1 | `MATH-UH` | `MATH-UH 1000AQ Math for Stats and Calculus Part I` | NYUAD MATH-UH sequence part A, quantitative. |
| `BQ` | 1 | `MATH-UH` | `MATH-UH 1000BQ Math for Stats and Calculus Part II` | NYUAD MATH-UH sequence part B, quantitative. |
| `CE` | 1 | `SCIEN-UH` | `SCIEN-UH 1344CE Foundations of Science 3 Lab: Chemistry` | NYUAD FoS lab designator (Chemistry-Extended). |
| `EJ` | 1 | `CCOL-UH` | `CCOL-UH 2001EJ An Ocean Voyage` | NYUAD experimental + January. |
| `EP` | 1 | `SCIEN-UH` | `SCIEN-UH 1564EP Foundations of Science 6 Lab: Physics` | NYUAD FoS lab designator (Physics-Extended). |
| `GX` | 1 | `CSTS-UH` | `CSTS-UH 1059GX Urban Violence: The Middle East` | Global + variable-topic, NYUAD. |
| `JX` | 1 | `CCOL-UH` | `CCOL-UH 2045JX Gendering Islam in the Global City` | January + variable-topic, NYUAD. |
| `K` | 1 | `EAP-SHU` | `EAP-SHU 100K EAP: Cultivating Minds` | SHU topic variant. |
| `M` | 1 | `EAP-SHU` | `EAP-SHU 100M Hacking Happiness ...` | SHU topic variant. |
| `N` | 1 | `EAP-SHU` | `EAP-SHU 100N Fashion Consciousness` | SHU topic variant. |
| `R` | 1 | `EAP-SHU` | `EAP-SHU 100R (Un)Sustainability` | SHU topic variant. |
| `U` | 1 | `EAP-SHU` | `EAP-SHU 100U Money Stuff` | SHU topic variant. |
| `XG` | 1 | `CP-UY` | `CP-UY 200XG Experiential Learning Seminar` | Tandon variable-topic + global. |
| `Y` | 1 | `EAP-SHU` | `EAP-SHU 100Y Food for Thought ...` | SHU topic variant. |

**Summary of what the parser needs to accept:** empty suffix, plus any 1–2 trailing uppercase letters. The set of observed two-letter suffixes is `{AQ, BQ, BE, CE, EJ, EP, EQ, GX, JX, XG}`. The set of observed single letters is `{A, B, C, D, E, F, G, H, I, J, K, L, M, N, P, Q, R, S, T, U, V, W, X, Y}`. Not every combination of uppercase letters is known to exist — the parser should accept the *pattern* `[A-Z]{0,2}$` rather than enumerating each combination.

---

## 3. Session code vocabulary

**Not in the bulletin.** Session codes (sometimes called "half-term codes" or "section dates") appear only in Albert class-search results, not in the course catalog. This section is populated from real pastes as they arrive, not from the nomenclature scrape.

| Code | Meaning | Typical dates (Fall 2026) | Campus | Confirmed from |
| --- | --- | --- | --- | --- |
| `A71` | NYUAD first half | Aug 31 – Oct 16 | NYU Abu Dhabi | ENGR-UH + PHYED-UH Albert pastes, 2026-04-23 |
| `A72` | NYUAD second half | Oct 26 – Dec 14 | NYU Abu Dhabi | Same pastes |
| `AD` | NYUAD full term | Aug 31 – Dec 14 | NYU Abu Dhabi | Same pastes |
| `1`  | Tandon full term | Aug 31 – Dec 14 (inferred) | Tandon School of Engineering | CS-UY Albert paste (date TBD) |
| `G0C` | Tandon global / Paris | full Paris term | Tandon, study-away sections | CS-UY Albert paste, Paris sections |
| _TBD_ | Shanghai half/full terms | — | NYU Shanghai | Not yet observed |
| _TBD_ | Washington Square standard / non-standard | — | College of Arts and Science, Stern, Tisch, Steinhardt, Gallatin, etc. | Not yet observed |
| _TBD_ | Graduate / Law terms | — | GSAS, Law, GSPH, Wagner, Silver | Not yet observed |
| _TBD_ | Medicine terms | — | Grossman, Grossman LI | Not yet observed |
| _TBD_ | Dentistry terms | — | College of Dentistry | Not yet observed |

Rules:
- Parser preserves the session code verbatim as `session.code`. No code validation; unknown codes don't warn (they're expected).
- Conflict detection uses the session's `start_date` / `end_date` range, not the code string. Codes are for display + debugging.
- When a new session code shows up from a paste, add it to this table with the dates observed.

---

## 4. Component vocabulary

**Not in the bulletin.** Component values (`Lecture`, `Laboratory`, `Recitation`, …) appear only in Albert class-search pastes, on the `Component: <value>` line. This section is the parser's allowlist; unknown components still parse but fire a `unknown_component` warning.

**Confirmed from NYUAD pastes (ENGR-UH, PHYED-UH, 2026-04-23):**

- `Lecture`
- `Laboratory`
- `Recitation`
- `Seminar`
- `Studio`
- `Workshop`
- `Clinic`
- `Independent Study`
- `Project`
- `Field Instruction/Field Superv`

**Confirmed from Tandon (CS-UY paste, date TBD):**

- `Guided Studies`
- `Research`

**Not yet observed but expected per school (TBD, add when a paste confirms):**

- Tisch — `Rehearsal`, `Performance`, possibly `Masterclass`
- Stern — `Case Study`, `Discussion`
- Law — `Clinical Course`, possibly `Externship`, `Simulation`
- Medicine (Grossman / Grossman LI) — `Rounds`, `Clerkship`, others
- Dentistry — `Practicum`, likely clinical-rotation variants
- Gallatin — possibly `Private Lesson` (there's an `INDIV-GG 2701 Private Lesson` course; format unknown)
- SHU — possibly `Colloquium`, `Site Visit`

Rules:
- Parser preserves the component verbatim as `section.component`. Unknown values fire `unknown_component` but parsing continues.
- When a new value shows up, add it to the confirmed list above and remove it from TBD.

---

## 5. Known gaps

Things the bulletin scrape cannot answer. Each needs a live Albert class-search paste (and sometimes a parser extension) to close.

- **Session codes per campus.** Bulletin has no concept of half-term / section dates. Only pastes reveal them. Section 3 stays TBD until all campuses have been pasted at least once.
- **Component vocabulary.** Same reason. Section 4 stays TBD until all schools are covered.
- **Topics-course structure.** Variable-topic courses (`X`-suffix, `FYSEM-UA`, `IDSEM-UG`, etc.) render as `ENGL-UA 56 Topics:` in the bulletin with no specific topic. The actual topic ("The Modern American Novel") appears on a per-section `Topic:` line in Albert pastes. The parser currently ignores `Topic:` lines. If planners want topic-level disambiguation, the parser needs to capture that line and attach it to the section.
- **Course-level cross-listing.** The scrape confirmed **no prefix-level** cross-listing (one prefix, one school). But **individual courses** can be cross-listed across numbers (`CS-UY 1134` alongside `CS-UY 1134G`, or `ENGL-UA 56` alongside `HIST-UA 56`). Legacy Albert pastes show this with a sibling course-header block. The parser treats them as separate Course objects; a planner-layer heuristic could collapse them. Not implemented.
- **Unassigned prefixes.** 31 prefixes in the subtable of section 1 were reachable from the /courses/ URL space but not from any degree-granting school's Course Inventory. Most look like Professional Studies / continuing-ed / non-degree programs. Needs manual classification by someone with authoritative knowledge of NYU's program hierarchy.
- **Fall 2026 vs. other-term pastes.** Everything confirmed so far is from one Fall 2026 snapshot. Spring and summer pastes may expose new sessions (`J` / `SU` / etc.) and new components.

When any of these gaps closes, update the relevant section here AND bump the "Confirmed from" footprint so future contributors can trace when/how each fact entered the doc.
