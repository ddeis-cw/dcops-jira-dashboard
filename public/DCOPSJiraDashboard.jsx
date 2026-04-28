import { useState, useMemo, useCallback } from "react";

// ── Built-in CSV parser — no external dependencies ────────────
function parseCSVLine(line) {
  const fields = [];
  let field = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(field); field = "";
    } else field += ch;
  }
  fields.push(field);
  return fields;
}
function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").trim(); });
    return row;
  });
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

// ── Headcount formula presets ──────────────────────────────────
const HC_FORMULAS = [
  {
    id: "premium",
    label: "Premium Service",
    tpw: 5, tpd: 1,
    color: "#10b981",
    desc: "Complex/hands-on work — new DC buildouts, heavy hardware. ~1 ticket/person/day.",
    badge: "HDI Field Tech",
  },
  {
    id: "standard",
    label: "Balanced Ops",
    tpw: 10, tpd: 2,
    color: "#3b82f6",
    desc: "Mixed DC operations — standard ITIL Tier 2. ~2 tickets/person/day.",
    badge: "Current Baseline",
  },
  {
    id: "optimized",
    label: "High Throughput",
    tpw: 15, tpd: 3,
    color: "#f59e0b",
    desc: "Streamlined, mature operations with playbooks. ~3 tickets/person/day.",
    badge: "ITIL Optimized",
  },
  {
    id: "lean",
    label: "Maximum Capacity",
    tpw: 20, tpd: 4,
    color: "#ef4444",
    desc: "Lean staffing — high-volume, routine/automated-assist tasks. ~4 tickets/person/day.",
    badge: "Lean Model",
  },
  {
    id: "custom",
    label: "Custom",
    tpw: null, tpd: null,
    color: "#a78bfa",
    desc: "Set your own target tickets/person/week.",
    badge: "Custom",
  },
];

// ── Period options ─────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: "Last 1 day",   days: 1 },
  { label: "Last 7 days",  days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 60 days", days: 60 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 180 days",days: 180 },
  { label: "Last 365 days",days: 365 },
];

// ── Server counts per site (from Snipe-IT export 2026-04-08)
// ⚠ VALUES MUST BE NUMBERS ONLY — do not add name→site mappings here (use EMPLOYEE_SITES below) ─────────────────
// 97,460 active servers across 41 sites
// Source: custom-assets-report-2026-04-08 (servers category, excl. RMAd/decommissioned)
// Regenerate: re-export from Snipe-IT → run fetch-servers-by-region-v2.js
// Note: SE-SKH (EU-NORTH-04A) and DK-SVL (EU-NORTH-05A) are new EU sites,
//       mapped to SE-FAN pending dedicated site codes in the platform.
const SERVER_COUNTS = {
// ⚠ VALUES MUST BE NUMBERS ONLY — do not add name→site mappings here
// Source: Jira Assets schema 127 (snipe-it-infrastructure), live fetch 2026-04-21
  "US-LZL": 29588,
  "US-DTN": 9543,
  "US-ARQ": 6995,
  "US-CSZ": 5010,
  "US-RIN": 4343,
  "US-VO2": 2589,
  "NO-OVO": 1934,
  "US-EVI": 1561,
  "US-QNC": 973,
  "US-CDZ": 919,
  "CA-GAL": 762,
  "US-PPY": 563,
  "US-CMH": 562,
  "US-EWS": 483,
  "US-WCI": 335,
  "US-BVI": 331,
  "US-CVY": 325,
  "US-DGV": 304,
  "US-DNN": 282,
  "US-PLZ": 281,
  "US-OBG": 273,
  "US-WJQ": 254,
  "US-LAS": 240,
  "DK-SVL": 237,
  "US-SPK": 188,
  "SE-FAN": 164,
  "US-PHX": 163,
  "US-AUS": 161,
  "US-LNB": 158,
  "US-NKQ": 153,
  "US-LHS": 152,
  "US-CVG": 82,
  "SE-SKH": 72,
  "US-SKY": 67,
  "US-MSC": 42,
  "ES-AVQ": 27,
  "ES-BCN": 17,
  "US-LBB": 16,
  "GB-PPL": 14,
  "US-AAI": 10,
  "US-LOE": 8,
  "US-RRX": 8,
  "GB-CWY": 7,
  "US-SVG": 7,
  "US-HIO": 6,
  "US-LYF": 5,
  "US-ATL": 3,
  "US-NNN": 3,
  "US-HMN": 2,
};



// ── Data Center Technicians roster ────────────────────────────
// DCT_LIST is populated at runtime from the API (/api/employees → dctList)
// No hardcoded names — managed entirely through Jira Assets job titles
const DCT_LIST = new Set();

// ─────────────────────────────────────────────────────────────
// COLOR PALETTE
// ─────────────────────────────────────────────────────────────
const PALETTE = [
  "#6366f1","#10b981","#f59e0b","#f97316","#22d3ee","#a78bfa",
  "#ec4899","#14b8a6","#84cc16","#ef4444","#3b82f6","#e879f9",
  "#fb923c","#34d399","#facc15","#60a5fa","#f472b6","#2dd4bf",
  "#a3e635","#c084fc","#fbbf24","#38bdf8","#4ade80","#f87171",
];
const locColorCache = {};
let colorIdx = 0;
function locColor(loc) {
  if (!loc) return "#64748b";
  if (!locColorCache[loc]) locColorCache[loc] = PALETTE[colorIdx++ % PALETTE.length];
  return locColorCache[loc];
}

// ─────────────────────────────────────────────────────────────
// LOCATION REMAPPING ENGINE
// ─────────────────────────────────────────────────────────────
const EMPLOYEE_SITES = {
  // CA-GAL
  "Alaa Ibrahim": "CA-GAL",
  "Allen Cayen": "CA-GAL",
  "Andrew Truong": "CA-GAL",
  "Anmol Mann": "CA-GAL",
  "Arun Joseph": "CA-GAL",
  "Benjamin Tompkins": "CA-GAL",
  "Ismailyn Bonilla": "CA-GAL",
  "John Mulhausen": "CA-GAL",
  "Jon Lawson": "CA-GAL",
  "Jorge Silva": "CA-GAL",
  "Joseph Parvu": "CA-GAL",
  "Justin Brooks": "CA-GAL",
  "Justin Handley": "CA-GAL",
  "Kinzi Stone": "CA-GAL",
  "Martin Mark": "CA-GAL",
  "Max Kuznetsov": "CA-GAL",
  "Nishant Saini": "CA-GAL",
  "Ram Singh": "CA-GAL",
  "Ramtin Alikhani": "CA-GAL",
  "Ronnie Howell": "CA-GAL",
  "Sandeep Singh": "CA-GAL",
  "Tod Lazarov": "CA-GAL",
  "Yadi Saggu": "CA-GAL",

  // DK-SVL
  "Benno Hembo [C]": "DK-SVL",
  "Gabriele Magliano": "DK-SVL",
  "Ivan Mendez Vila": "DK-SVL",
  "Kris Lujanovic": "DK-SVL",
  "Muhammad Mamun": "DK-SVL",
  "Nicolai Mass": "DK-SVL",
  "Robert Ritter": "DK-SVL",

  // ES-AVQ
  "Christian Campo": "ES-AVQ",
  "Juan De la Torre": "ES-AVQ",
  "Marcos Montoro Riestra": "ES-AVQ",
  "Marek Krzesiak": "ES-AVQ",
  "Mohammed Belkassmi El Boukyly": "ES-AVQ",
  "Sergio Mendoza": "ES-AVQ",
  "Tamara Beisti": "ES-AVQ",
  "Vito Koleganov": "ES-AVQ",

  // ES-BCN
  "Alberto Pel\u00e1ez": "ES-BCN",
  "Basilio Saez Sanchez": "ES-BCN",
  "B\u00e9atrice Cazenave": "ES-BCN",
  "Eduardo Allende": "ES-BCN",
  "Ezequiel Ramos Vertiz": "ES-BCN",
  "Fabrizio Fermo": "ES-BCN",
  "Jack O'Doherty": "ES-BCN",
  "Jaffin George": "ES-BCN",
  "Josu\u00e9 Mariblanca L\u00f3pez": "ES-BCN",
  "Muizz Opebi": "ES-BCN",
  "Stephen Delaney": "ES-BCN",
  "Tomas Parzianello": "ES-BCN",
  "Yoann Herembourg": "ES-BCN",

  // GB-CWY
  "Ben Butler": "GB-CWY",
  "Ben O'Dowd": "GB-CWY",
  "Diego Monroy": "GB-CWY",
  "Liam Rabey": "GB-CWY",
  "Loyd Alappatt": "GB-CWY",
  "Nigel Bradby": "GB-CWY",
  "Rhys Lopez-Lloyd": "GB-CWY",
  "Sam Howlett": "GB-CWY",
  "Tommy Whitmore": "GB-CWY",

  // GB-PPL
  "Anwar Islam": "GB-PPL",
  "Aravinda Sopinti": "GB-PPL",
  "Damien Henry": "GB-PPL",
  "Deavin Jenis": "GB-PPL",
  "Jonny Barker": "GB-PPL",
  "Scott Hall": "GB-PPL",
  "Tenzin Ngodup": "GB-PPL",
  "Teodor Nikolov": "GB-PPL",
  "Tunde Olabode": "GB-PPL",

  // NO-OVO
  "Emil Jonsson": "NO-OVO",
  "George Agbo": "NO-OVO",
  "Hassan Syed": "NO-OVO",
  "Kamil Wegrzyk": "NO-OVO",
  "Nathan Francis": "NO-OVO",
  "Nipun Peiris": "NO-OVO",
  "Patryk Kedzierski": "NO-OVO",
  "Victor Ponce Mayo": "NO-OVO",

  // SE-FAN
  "Dmytro Intelehator": "SE-FAN",
  "Dulari Imalka": "SE-FAN",
  "Farhan Shahzad": "SE-FAN",
  "Ilie Puiu": "SE-FAN",
  "Jonny Callow": "SE-FAN",
  "Shashi Fernando": "SE-FAN",
  "Syed Muhammad Ali": "SE-FAN",
  "Zain Nasir": "SE-FAN",
  "Zeljko Cako": "SE-FAN",

  // SE-SKH
  "Amal Paul": "SE-SKH",
  "Craig Macnish": "SE-SKH",
  "Marlon Sevilla": "SE-SKH",
  "Mostafa Abbas": "SE-SKH",
  "Nauman Khan": "SE-SKH",
  "Salman Muhammad": "SE-SKH",
  "Thenujan Prabaharan": "SE-SKH",
  "Waseem ahmed Bhatti": "SE-SKH",

  // US-AAI
  "Alpha Diallo": "US-AAI",
  "Amanda Desir": "US-AAI",
  "Charlie Valentine": "US-AAI",
  "Daniel Borders": "US-AAI",
  "Jamie Lee": "US-AAI",
  "Kendall Lee": "US-AAI",
  "Kirk Taylor": "US-AAI",
  "Marcus Quisenberry": "US-AAI",
  "Nadarrius Eckers": "US-AAI",
  "Travis Killette": "US-AAI",

  // US-ABD
  "John Sauer": "US-ABD",

  // US-ARQ
  "Andrew Barnhart": "US-ARQ",
  "Bill Miller": "US-ARQ",
  "Billy Parkerson": "US-ARQ",
  "Brady Miller": "US-ARQ",
  "Daniel Parkerson": "US-ARQ",
  "Dawson Post": "US-ARQ",
  "Dustin Breazeale": "US-ARQ",
  "Gavin McCray": "US-ARQ",
  "Ivan Martinez": "US-ARQ",
  "James Bethea": "US-ARQ",
  "John Salazar": "US-ARQ",
  "Josef Stroup": "US-ARQ",
  "Justin Clark": "US-ARQ",
  "Kyle Kotchenreuther": "US-ARQ",
  "Lane Gibson": "US-ARQ",
  "Marcus McCord": "US-ARQ",
  "Marvin Villanueva": "US-ARQ",
  "Matthew Morris": "US-ARQ",
  "Pierre Nacoulma": "US-ARQ",
  "Timothy McGaha": "US-ARQ",
  "Timothy Williams": "US-ARQ",
  "Tom West": "US-ARQ",
  "Tyler Holloway": "US-ARQ",
  "joey hester": "US-ARQ",

  // US-AUS
  "Howard Cook": "US-AUS",
  "Jaco Steynberg": "US-AUS",
  "Jakob Parsons": "US-AUS",
  "John Hamilton": "US-AUS",
  "Katalina Annette": "US-AUS",
  "Kelly Shea": "US-AUS",
  "Kevin Williams": "US-AUS",
  "Lucas Swoyer": "US-AUS",
  "Mark Galvan": "US-AUS",
  "Myron Shelby": "US-AUS",
  "Nelson Evangelista": "US-AUS",
  "Oscar Torres": "US-AUS",
  "Samuel Lacy": "US-AUS",
  "Travis Jamail": "US-AUS",

  // US-BVI
  "Ahmed Nuhu": "US-BVI",
  "Alan Bersavage": "US-BVI",
  "Chris Grey": "US-BVI",
  "Cody Sheetz": "US-BVI",
  "Daniel Martinez": "US-BVI",
  "Dario Garcia": "US-BVI",
  "Dominique Totani": "US-BVI",
  "John Wray": "US-BVI",
  "Jonathan Clemente": "US-BVI",
  "Mitchell Sabol": "US-BVI",
  "Robert Keller": "US-BVI",
  "Sergio De Anda": "US-BVI",
  "Tom Apostol": "US-BVI",
  "Tyler Lee": "US-BVI",

  // US-CDZ
  "Alex Olsen": "US-CDZ",
  "Casey Diotte": "US-CDZ",
  "Chakiel Crumsey": "US-CDZ",
  "Darren Strawbridge": "US-CDZ",
  "Dylan Jayce": "US-CDZ",
  "Jabbar Mendez": "US-CDZ",
  "Matt Michanowicz": "US-CDZ",
  "Mitch Henley": "US-CDZ",
  "Rene Tamez": "US-CDZ",
  "Steaphon Starks-Harris": "US-CDZ",
  "Tyler Darden": "US-CDZ",

  // US-CLY
  "Bryan Meyer": "US-CLY",
  "Giselle Smith": "US-CLY",
  "Julian Alvarez": "US-CLY",
  "Seth Geiser": "US-CLY",

  // US-CMH
  "Cedric T Nchinda": "US-CMH",
  "Damon Nicely": "US-CMH",
  "Emmanuel Metuge": "US-CMH",
  "Jared Varkonda": "US-CMH",
  "Justin Emerson": "US-CMH",
  "Karim Camara": "US-CMH",
  "Keith Barbo": "US-CMH",
  "Marc Valentine": "US-CMH",
  "Qian Kui Liu": "US-CMH",
  "Romaric Guidigansou": "US-CMH",
  "Royal Durant": "US-CMH",
  "Stephanie Lenzo": "US-CMH",
  "Suman Khanal": "US-CMH",
  "Timothy Days": "US-CMH",
  "Vadim Korshunov": "US-CMH",

  // US-CSZ
  "Afton Harrow": "US-CSZ",
  "Angel Rosado": "US-CSZ",
  "Atoi Smith": "US-CSZ",
  "Brian Zolnai": "US-CSZ",
  "Cam Nhean": "US-CSZ",
  "Collin Grogan": "US-CSZ",
  "David Jones": "US-CSZ",
  "Desmond Eche": "US-CSZ",
  "Donald Jacks": "US-CSZ",
  "Donnell Lowery": "US-CSZ",
  "Drue Berkheimer": "US-CSZ",
  "Erik Dillon": "US-CSZ",
  "Ernesto Padilla": "US-CSZ",
  "Gunnar Rose": "US-CSZ",
  "Guy Frederick": "US-CSZ",
  "Ian Walker": "US-CSZ",
  "Jacob Melton": "US-CSZ",
  "Jason Boyce": "US-CSZ",
  "Jason Stimpson": "US-CSZ",
  "Jean Beibro": "US-CSZ",
  "Jeffrey Villena": "US-CSZ",
  "Jeremy Knappe": "US-CSZ",
  "JoJo McGrady": "US-CSZ",
  "Jose Fernandez": "US-CSZ",
  "Joseph Mastro": "US-CSZ",
  "Julian Ascencio": "US-CSZ",
  "KB Baker": "US-CSZ",
  "Kiwian Christian": "US-CSZ",
  "Melvin Valentin": "US-CSZ",
  "Michael Canavatchel": "US-CSZ",
  "Nana Boahene": "US-CSZ",
  "Patrick Wilson": "US-CSZ",
  "Seth Schiele": "US-CSZ",
  "Shaka Moton": "US-CSZ",
  "Sheila Fontes": "US-CSZ",
  "Val Dji": "US-CSZ",
  "William Morrow": "US-CSZ",

  // US-CVG
  "Alfred Nyamusa": "US-CVG",
  "Alissah Wiles": "US-CVG",
  "Brian Schaeffer": "US-CVG",
  "Josh Burk": "US-CVG",
  "Joshua Webb": "US-CVG",
  "Malachie Mbengani": "US-CVG",
  "Phil Robinson": "US-CVG",
  "Timothy Morgan": "US-CVG",
  "Vayan Adams": "US-CVG",

  // US-CVY
  "Anthony Martin": "US-CVY",
  "Brent Waller": "US-CVY",
  "Bryan Newbill": "US-CVY",
  "Christian Woicikowfski": "US-CVY",
  "Fred Bailey": "US-CVY",
  "Harrison Williams": "US-CVY",
  "Heath Kidd": "US-CVY",
  "Jake Guerrant": "US-CVY",
  "James Matthews Jr.": "US-CVY",
  "Jason Maples": "US-CVY",
  "Jeremy Iwanowski": "US-CVY",
  "Jonathon Bouchard": "US-CVY",
  "Matthew Tolsa": "US-CVY",
  "Mike West": "US-CVY",
  "Mohamed Badri": "US-CVY",
  "Ron Jones": "US-CVY",
  "Roy Toral": "US-CVY",
  "Scott Rucker": "US-CVY",
  "Shantanell Robinson": "US-CVY",
  "Stephen Pattarini": "US-CVY",
  "Thomas Alexander": "US-CVY",
  "Victor Yore": "US-CVY",

  // US-DGV
  "Colin McKay": "US-DGV",
  "Hunter Adams": "US-DGV",
  "Loki Blanchett": "US-DGV",
  "Nehemiah Johnson": "US-DGV",
  "Thomas Brennecke": "US-DGV",
  "William McMichael": "US-DGV",

  // US-DNN
  "Alexis McCracken": "US-DNN",
  "Austin Hall": "US-DNN",
  "Ben Callahan": "US-DNN",
  "Blaze Nelson": "US-DNN",
  "Brett Phillips": "US-DNN",
  "Grady Martin": "US-DNN",
  "Jay Randall": "US-DNN",
  "Jeremy Smith": "US-DNN",
  "Joshua Duckett": "US-DNN",
  "Joshua Stowe": "US-DNN",
  "Kevin Cone": "US-DNN",
  "Mahamadi Kiogo": "US-DNN",
  "Otis Tate": "US-DNN",
  "Patrick Wolfe": "US-DNN",
  "Raphael Ejike": "US-DNN",
  "Reanna Moore": "US-DNN",
  "Timothy Holcomb": "US-DNN",
  "Zach Brown": "US-DNN",

  // US-DTN
  "Alyson McElroy": "US-DTN",
  "Andrew Hulsey": "US-DTN",
  "Andrew Klentzman": "US-DTN",
  "Angel Trevino": "US-DTN",
  "Antonio Hudspeth": "US-DTN",
  "Arthur Tran": "US-DTN",
  "Arthur Trinidad": "US-DTN",
  "Austin Setliff": "US-DTN",
  "Bhavik Patel": "US-DTN",
  "Brayden Williams": "US-DTN",
  "Brian Mabe": "US-DTN",
  "Bryan Cooper": "US-DTN",
  "Cameron Aderibigbe": "US-DTN",
  "Chad Watts": "US-DTN",
  "Chan Vilayvanh": "US-DTN",
  "Chase Coffaro": "US-DTN",
  "Christian Jackson": "US-DTN",
  "Christian Quiroz": "US-DTN",
  "Christian Rios": "US-DTN",
  "Christopher Freeman": "US-DTN",
  "Christopher Matz": "US-DTN",
  "Chuks Ihuoma": "US-DTN",
  "Clarence Shields": "US-DTN",
  "Cody Kiminski": "US-DTN",
  "Cori Marie": "US-DTN",
  "Dan Brown": "US-DTN",
  "Danny James": "US-DTN",
  "Dante Traghella": "US-DTN",
  "David Davidson": "US-DTN",
  "Devon Loud": "US-DTN",
  "Dexter Otokunrin": "US-DTN",
  "Dino Dean": "US-DTN",
  "Dom Sonemangkhala": "US-DTN",
  "Edward Mcgregor [C]": "US-DTN",
  "Edwin Esene": "US-DTN",
  "Erin Rudd": "US-DTN",
  "Eve Spainhower": "US-DTN",
  "Faufili Lavea": "US-DTN",
  "Francais Falansa Mabeka": "US-DTN",
  "Franklin Ossai": "US-DTN",
  "Gabriel Oteri": "US-DTN",
  "Garrett Tompkins": "US-DTN",
  "Geoffrey Greene": "US-DTN",
  "George Baltierrez": "US-DTN",
  "George Puente": "US-DTN",
  "Gerardo Garcia": "US-DTN",
  "Henil Patel": "US-DTN",
  "Hernan Arce": "US-DTN",
  "Hunter Fellman": "US-DTN",
  "Jake Grantham": "US-DTN",
  "James Owens": "US-DTN",
  "Jason Shroads": "US-DTN",
  "Jason Turek": "US-DTN",
  "Javier Garcia": "US-DTN",
  "Jaylon Heller": "US-DTN",
  "Jesse Atkinson": "US-DTN",
  "Jesse Ball": "US-DTN",
  "Joe Duncan": "US-DTN",
  "Joel Gonzalez": "US-DTN",
  "Jofiel Gomez": "US-DTN",
  "John Ravago": "US-DTN",
  "Johnathan Jackson": "US-DTN",
  "Jon Cortez": "US-DTN",
  "Jonathan Gomez": "US-DTN",
  "Josh Nuerge": "US-DTN",
  "Joshua Hollingsworth": "US-DTN",
  "Justin Austin": "US-DTN",
  "Justin Czubas": "US-DTN",
  "Kade LaCroix": "US-DTN",
  "Kedarion Chance": "US-DTN",
  "Kevin Hutcheson": "US-DTN",
  "Kevin Ly": "US-DTN",
  "Kiana Massey": "US-DTN",
  "Latrice Reece": "US-DTN",
  "Logan Davis": "US-DTN",
  "Logan White": "US-DTN",
  "Lokesh Dahal": "US-DTN",
  "Luis Magana": "US-DTN",
  "Mark McDowell": "US-DTN",
  "Mark McDuffie": "US-DTN",
  "Mark Orlov": "US-DTN",
  "Maximus Gradwohl": "US-DTN",
  "Michael Collins": "US-DTN",
  "Michael Welch": "US-DTN",
  "Mike Morton": "US-DTN",
  "Mike Parker": "US-DTN",
  "Mo Blanco": "US-DTN",
  "My Bui": "US-DTN",
  "Nartey Tanihu": "US-DTN",
  "Nevin Thomas": "US-DTN",
  "Neyazi Eltayeb": "US-DTN",
  "Nick Paige": "US-DTN",
  "Nick Terrazas": "US-DTN",
  "Norman Norwood Jr": "US-DTN",
  "Paul Dumerer": "US-DTN",
  "Randall Gomez": "US-DTN",
  "Reece Edwards": "US-DTN",
  "Rob Bradley": "US-DTN",
  "Rob Chatter": "US-DTN",
  "Roopesh Kaithal": "US-DTN",
  "Shawn Hiles": "US-DTN",
  "Sheng Liang": "US-DTN",
  "Stephen Endress": "US-DTN",
  "Steven Sallis": "US-DTN",
  "Tam Vu-Tam": "US-DTN",
  "Tayo Adewoye": "US-DTN",
  "Terry Simien": "US-DTN",
  "Thien Nguyen": "US-DTN",
  "Thomas Del Valle": "US-DTN",
  "Tim Perez": "US-DTN",
  "Tony Evans": "US-DTN",
  "Tony Grijalva": "US-DTN",
  "Trent Hall": "US-DTN",
  "Troy Wilkinson": "US-DTN",
  "Walt Raemhild": "US-DTN",
  "Wogene Biru": "US-DTN",
  "Xavier Evans": "US-DTN",
  "Zach Brenn": "US-DTN",

  // US-EVI
  "Adedayo Aderinto": "US-EVI",
  "Alex Murillo": "US-EVI",
  "Andrew Westberg": "US-EVI",
  "Andrzej Klejka": "US-EVI",
  "Cocoa Dunner": "US-EVI",
  "Fabian Rosado": "US-EVI",
  "James Logan": "US-EVI",
  "Joshua Tapia": "US-EVI",
  "Parth Patel": "US-EVI",
  "Raj Patel": "US-EVI",
  "Raphael Rodea": "US-EVI",
  "Romeo Patino": "US-EVI",
  "Sanjay Patel": "US-EVI",
  "Talha Shakil": "US-EVI",

  // US-EWS
  "Ahmed Ragab": "US-EWS",
  "Chris Jump": "US-EWS",
  "Igor Shparber": "US-EWS",
  "Jerry Della Femina": "US-EWS",
  "John Bellingeri": "US-EWS",
  "Kevin Whittle": "US-EWS",
  "Manny Fernandes": "US-EWS",
  "Mike LaFace": "US-EWS",
  "Nicholas Freeman": "US-EWS",
  "Omar Khan": "US-EWS",
  "Patrick McDermott": "US-EWS",
  "Sergey Zelinsky": "US-EWS",
  "Thomas G Laird": "US-EWS",
  "Tony Pino": "US-EWS",
  "Zakaullah Khan": "US-EWS",

  // US-HIO
  "Andrea Smith": "US-HIO",
  "Brandon Jang": "US-HIO",
  "Brian Barbeau": "US-HIO",
  "Carter Kelso": "US-HIO",
  "Cassidy Hayes": "US-HIO",
  "Cecily Van Vaerenewyck": "US-HIO",
  "Chanler Simpson": "US-HIO",
  "Charley Franson": "US-HIO",
  "Cyrus Anonuevo": "US-HIO",
  "Francis Cabangcalan": "US-HIO",
  "Jesse Brackenbury": "US-HIO",
  "Jonah Connelly": "US-HIO",
  "Joseph Aviles": "US-HIO",
  "Julien Voorhoeve": "US-HIO",
  "Kyle Sanchez": "US-HIO",
  "Malachi Thorne": "US-HIO",
  "Michael Allen": "US-HIO",
  "Mike Tiffany": "US-HIO",
  "Orlando Camba": "US-HIO",
  "Tanner Pavlacky": "US-HIO",
  "Tomas Mendoza": "US-HIO",

  // US-HMN
  "Blaine Garelick": "US-HMN",
  "Brian Centeno": "US-HMN",
  "Christopher Muckle": "US-HMN",
  "Chuck Kern": "US-HMN",
  "Jason Lee": "US-HMN",
  "Jeffrey Mickolayck": "US-HMN",
  "Kenneth Taylor": "US-HMN",
  "Liam Sheehy": "US-HMN",
  "Raul Palomares": "US-HMN",
  "Rodney Ballard": "US-HMN",

  // US-KWO
  "Eric Henderson": "US-KWO",

  // US-LAS
  "Aaron Edwards": "US-LAS",
  "Andreas Macavei": "US-LAS",
  "BJ Graziano": "US-LAS",
  "Brandon Gash": "US-LAS",
  "Chad Vandemerwe": "US-LAS",
  "Chalynne Jackson": "US-LAS",
  "Chris Skjerseth": "US-LAS",
  "Christopher Conley": "US-LAS",
  "Daniel Gardner": "US-LAS",
  "Daniel Marquez": "US-LAS",
  "Devin Cotton": "US-LAS",
  "Dylan Davila": "US-LAS",
  "Gabriel Wade": "US-LAS",
  "Jameson Malpezzi": "US-LAS",
  "Jamison Mccurley": "US-LAS",
  "Jason Bright": "US-LAS",
  "Jay Brown": "US-LAS",
  "John Gardner": "US-LAS",
  "Jonathan Gonnello": "US-LAS",
  "Jordyn Compehos": "US-LAS",
  "Juan Vega Martinez": "US-LAS",
  "Justin Weathersbee": "US-LAS",
  "Mike Bounthong": "US-LAS",
  "Nicholas Golovkin": "US-LAS",
  "Rafael Perez": "US-LAS",
  "Robert White": "US-LAS",
  "Sean Anderson": "US-LAS",
  "Theodore Allen": "US-LAS",
  "Toma Kovacevich": "US-LAS",

  // US-LBB
  "Abdul Hameed": "US-LBB",
  "Abdullah Alblooshi": "US-LBB",
  "Abid Hussain": "US-LBB",
  "Afeef Ahmed": "US-LBB",
  "Ammar Ahmed": "US-LBB",
  "Erron Wilson": "US-LBB",
  "Everett Holmes": "US-LBB",
  "Hamdan Albalooshi": "US-LBB",
  "Jose Gutierrez": "US-LBB",
  "Joshua Rios": "US-LBB",
  "Kader Kondiano": "US-LBB",
  "Kenneth Sedgwick": "US-LBB",
  "Khalifa Alblooshi": "US-LBB",
  "Michael Ramirez": "US-LBB",
  "Mujtaba Jawaid Hussain": "US-LBB",
  "Nicholas Smith": "US-LBB",
  "Randall Crump": "US-LBB",
  "Sharik Banipal": "US-LBB",
  "Spartacous Cacao": "US-LBB",
  "Teegwende Sawadogo": "US-LBB",
  "Victor Obioma": "US-LBB",
  "Zacrye Acebedo": "US-LBB",

  // US-LHS
  "Charles Payne II": "US-LHS",
  "Evan Storey": "US-LHS",
  "Graham Lawson": "US-LHS",
  "Jereme Solomon": "US-LHS",
  "Justin Spence": "US-LHS",
  "Matt Whittle": "US-LHS",
  "Noah Kim": "US-LHS",
  "Stephen Cantrell": "US-LHS",

  // US-LNB
  "Bill Alfano": "US-LNB",
  "Chester Chambers": "US-LNB",
  "Collin Piper": "US-LNB",
  "Da'wyna Pearson": "US-LNB",
  "David Ellis": "US-LNB",
  "Dawn Schimmel": "US-LNB",
  "Jack Benjamin": "US-LNB",
  "Logan Mullins": "US-LNB",
  "Mercy Ngwe": "US-LNB",
  "Tom Butcher": "US-LNB",

  // US-LOE
  "Abiodun Oyeleke": "US-LOE",
  "Andre Santos": "US-LOE",
  "Austin Lum": "US-LOE",
  "Cole Megna": "US-LOE",
  "Dan Menezes": "US-LOE",
  "Geo Fernandez": "US-LOE",
  "Jason Jarosh": "US-LOE",
  "Mitchell Segerson": "US-LOE",
  "Nancy Hutchings": "US-LOE",
  "Vothy Puch": "US-LOE",

  // US-LYF
  "Christian Rembert": "US-LYF",
  "Gerald Williams": "US-LYF",
  "Gus Azure": "US-LYF",
  "Jacob Manley": "US-LYF",
  "Justo Valmayor": "US-LYF",
  "Kaelin Lipscomb": "US-LYF",
  "Levi Pembroke": "US-LYF",

  // US-LZL
  "Adam Cicalo [C]": "US-LZL",
  "Ahmad Dunson [C]": "US-LZL",
  "Andre Davis [C]": "US-LZL",
  "Andrew Dennis [C]": "US-LZL",
  "Brad Schroeder": "US-LZL",
  "Caleb Ray [C]": "US-LZL",
  "Chris Norland [C]": "US-LZL",
  "Chris Palmer": "US-LZL",
  "Dan Eldridge": "US-LZL",
  "Devin Cobert": "US-LZL",
  "Duy Duong [C]": "US-LZL",
  "Dylan Rowe [C]": "US-LZL",
  "Edward Bird [C]": "US-LZL",
  "Eli Fernandes": "US-LZL",
  "Eric Ekstrand": "US-LZL",
  "Flavio Castillo": "US-LZL",
  "George Barnett [C]": "US-LZL",
  "Gerrit Schut [C]": "US-LZL",
  "Ibrahim Diallo": "US-LZL",
  "Isaiah McCants": "US-LZL",
  "Jabari Thompson": "US-LZL",
  "Jason Bittner": "US-LZL",
  "Joshua Langford [C]": "US-LZL",
  "Justin Scherer": "US-LZL",
  "Kaden Hill": "US-LZL",
  "Kevin Sanchez [C]": "US-LZL",
  "Lamar Wells": "US-LZL",
  "Naveem Thallam [C]": "US-LZL",
  "Peter Rudka [C]": "US-LZL",
  "Raymond Wood [C]": "US-LZL",
  "Rohan Monagoni": "US-LZL",
  "Shannon Kimball [C]": "US-LZL",
  "Stephane Diakalenga [C]": "US-LZL",
  "Steven Schidrich": "US-LZL",
  "Taylor Wateska": "US-LZL",
  "Terence Jones [C]": "US-LZL",
  "Uzaifa Abubakar [C]": "US-LZL",
  "Vincent Doxie [C]": "US-LZL",
  "Zachary Schroeder": "US-LZL",

  // US-MKO
  "Andrew Ramirez": "US-MKO",
  "Jacob Muir": "US-MKO",
  "Jaxson Humphrey": "US-MKO",
  "Jeffery Fourkiller": "US-MKO",
  "Jose Javier-Palomo": "US-MKO",
  "Leroy Pruitt": "US-MKO",
  "Lindsey Philpott": "US-MKO",
  "Marlon Jacobs": "US-MKO",
  "Michael Coulter": "US-MKO",
  "Nick McNeil": "US-MKO",
  "Sai Vaishnavi Battula": "US-MKO",

  // US-MSC
  "Addison Ruiz": "US-MSC",
  "Alle Parmenter": "US-MSC",
  "Connor Soefje": "US-MSC",
  "Devin Bustillos": "US-MSC",
  "Gustavo Chavez": "US-MSC",
  "Ricardo Trujillo": "US-MSC",
  "Robert Hernandez": "US-MSC",
  "Tony Hendrix": "US-MSC",

  // US-NKQ
  "AhmadMuneer Seddiqi": "US-NKQ",
  "Brett Edwards": "US-NKQ",
  "Bryan Ennis": "US-NKQ",
  "Gilman Yee": "US-NKQ",
  "Joshua Pascual": "US-NKQ",
  "Kevin Poso": "US-NKQ",
  "Monico Salvador": "US-NKQ",
  "Oliver Luo": "US-NKQ",
  "Seatty Than": "US-NKQ",

  // US-NNN
  "Aki Tesfamichael": "US-NNN",
  "Isaiah Lang": "US-NNN",
  "Jeremy Francis": "US-NNN",
  "Jose Rodriguez": "US-NNN",
  "Justin Beghin": "US-NNN",
  "Liana McCracken": "US-NNN",
  "Mike Garcia": "US-NNN",
  "Mike Rayburn": "US-NNN",
  "Nathan Lindorf": "US-NNN",
  "Tyler Noller": "US-NNN",

  // US-OBG
  "Adam Razac": "US-OBG",
  "Arezki Nadji": "US-OBG",
  "Arthur Chisolm": "US-OBG",
  "Corey Stedman": "US-OBG",
  "Donovan Martin": "US-OBG",
  "Frank D'Arrigo": "US-OBG",
  "Gabriel De Goes": "US-OBG",
  "Ivan Robles": "US-OBG",
  "John Maronna": "US-OBG",
  "Matthew Fusco": "US-OBG",
  "Otneal Woods": "US-OBG",
  "Quade Riley": "US-OBG",
  "Tony Francovilla": "US-OBG",
  "Yaw Frimpong": "US-OBG",

  // US-PHX
  "Alexander Antwan": "US-PHX",
  "Andy Ip": "US-PHX",
  "Brett DuBois": "US-PHX",
  "Brian Simpkins": "US-PHX",
  "Chris Hosley": "US-PHX",
  "Daniel Zaya": "US-PHX",
  "Devon Cabrera": "US-PHX",
  "Ethan Rotar": "US-PHX",
  "Jason Lothner": "US-PHX",
  "Leo Rossell": "US-PHX",
  "Monica Apodaca": "US-PHX",
  "Nathan Arnold": "US-PHX",
  "Osita Nduka": "US-PHX",
  "Rodrigo Espino": "US-PHX",

  // US-PLZ
  "Adrian Hall": "US-PLZ",
  "Alex Hanson": "US-PLZ",
  "Allan Brand": "US-PLZ",
  "Amanda Gutierrez": "US-PLZ",
  "Anthony Navarrete": "US-PLZ",
  "Austin Culp": "US-PLZ",
  "Austin Kelley": "US-PLZ",
  "Ben Pauling": "US-PLZ",
  "Blanchard Kasongo": "US-PLZ",
  "Cameron Culp": "US-PLZ",
  "Carlos Ellis": "US-PLZ",
  "Carric Dixon": "US-PLZ",
  "Chitimpa Chingwengwezi": "US-PLZ",
  "Danny Kirbie": "US-PLZ",
  "Darrell Dunnaway": "US-PLZ",
  "Daryl Voss": "US-PLZ",
  "Devin Harper": "US-PLZ",
  "Edward Reyna": "US-PLZ",
  "Esteban Sotelo": "US-PLZ",
  "Francis Momoh": "US-PLZ",
  "Gary Dhaul": "US-PLZ",
  "Gbanya Kamanda": "US-PLZ",
  "Ghaly Youssef": "US-PLZ",
  "Hayden Brookshire": "US-PLZ",
  "Ira Simmons": "US-PLZ",
  "James Smith": "US-PLZ",
  "Jason Harbin": "US-PLZ",
  "Jason Mosley": "US-PLZ",
  "Jason Quiroz": "US-PLZ",
  "Jessie Boyce": "US-PLZ",
  "Jesus Robles": "US-PLZ",
  "Joey Rauchwerger": "US-PLZ",
  "Jon Julius": "US-PLZ",
  "Jonathon Alfano": "US-PLZ",
  "Josh Miller": "US-PLZ",
  "Juan Hernandez": "US-PLZ",
  "Justen Davidson": "US-PLZ",
  "Kendal Edwards": "US-PLZ",
  "Linsell Annoh": "US-PLZ",
  "Mario Westbrook": "US-PLZ",
  "Mark Moore": "US-PLZ",
  "Matthew Brennan": "US-PLZ",
  "Muhammad Mohsin": "US-PLZ",
  "Nik Rhyne": "US-PLZ",
  "Nilo Zamora": "US-PLZ",
  "Ricardo Padilla": "US-PLZ",
  "Ryan Fisher": "US-PLZ",
  "Saabi Mehmood": "US-PLZ",
  "Sumit Samuel": "US-PLZ",
  "Tim Maruska": "US-PLZ",
  "Tim McDougall": "US-PLZ",
  "Vexton Buggs": "US-PLZ",
  "Will Cabrera": "US-PLZ",
  "Zeke Rodriguez": "US-PLZ",
  "Zengxing Pang": "US-PLZ",

  // US-PPY
  "Anil Shah": "US-PPY",
  "David Wright": "US-PPY",
  "Ethan Lang": "US-PPY",
  "Lawrence Fusco": "US-PPY",
  "Matthew Forsyth": "US-PPY",
  "Michael Meola": "US-PPY",
  "Ray Fuller": "US-PPY",
  "Rodrigo Gonzalez Silveira": "US-PPY",

  // US-QNC
  "Ashlie Munro": "US-QNC",
  "Brice Lucero": "US-QNC",
  "Bronson Urmston": "US-QNC",
  "Charlie Tables": "US-QNC",
  "Devon Deis": "US-QNC",
  "Grayson Schmidt": "US-QNC",
  "Jamie Zaragoza": "US-QNC",
  "Shon Hilton": "US-QNC",
  "Stephanie Garcia": "US-QNC",
  "Steven Mather": "US-QNC",
  "Todd Milev": "US-QNC",

  // US-RIN
  "Ben Walker": "US-RIN",
  "Corey Hall": "US-RIN",
  "David Filas": "US-RIN",
  "David Williamson": "US-RIN",
  "Eddie Bhopal": "US-RIN",
  "Faisal Al Belushi": "US-RIN",
  "Herby Isidor": "US-RIN",
  "Ignacio Olvera": "US-RIN",
  "Jason Korenek": "US-RIN",
  "Ryan Hebron": "US-RIN",
  "Ryan Mendez": "US-RIN",
  "Takesure Kondowe": "US-RIN",
  "Tommy Nguyen": "US-RIN",
  "Tony Neis": "US-RIN",

  // US-RRX
  "Anthony Zayas Rodriguez": "US-RRX",
  "Brady Bonario": "US-RRX",
  "Brianna Fisher": "US-RRX",
  "Chris Berry": "US-RRX",
  "Fernando Jeorge": "US-RRX",
  "James Jones": "US-RRX",
  "Kenan Vanecek": "US-RRX",
  "Larry Wendt": "US-RRX",
  "Milton Torres": "US-RRX",
  "Nicole Morgas": "US-RRX",

  // US-SKY
  "Adam Bugg": "US-SKY",
  "Anthony Henry": "US-SKY",
  "Christopher Spehar": "US-SKY",
  "Ibrahima Barry": "US-SKY",
  "Merfred Ngwe": "US-SKY",
  "Richard Mbunwe": "US-SKY",
  "Ronald Irving": "US-SKY",
  "Samuel Williams": "US-SKY",
  "Syjngjen Towner": "US-SKY",

  // US-SPK
  "Adrian Montes": "US-SPK",
  "Andres Cordova": "US-SPK",
  "Daniel Mahoney": "US-SPK",
  "Don Bellione": "US-SPK",
  "Evan Pearson": "US-SPK",
  "Fernando Cocio Jr.": "US-SPK",
  "Greg Silva": "US-SPK",
  "Isaac Johnson": "US-SPK",
  "Jordan Foster": "US-SPK",
  "Justin Fillmore": "US-SPK",
  "Matt Arnold": "US-SPK",
  "Mike Ureste": "US-SPK",
  "Omar Kamal": "US-SPK",
  "Sal Sanchez": "US-SPK",
  "Tommy Vereen": "US-SPK",
  "Zaldy Natividad": "US-SPK",

  // US-SVG
  "Brandon Chaney": "US-SVG",
  "Damion Cooper": "US-SVG",
  "Darren Vaughn": "US-SVG",
  "Joseph Styers": "US-SVG",
  "Justin Highsmith": "US-SVG",
  "Lucas Tourangeau": "US-SVG",
  "Marlon Wolfe": "US-SVG",
  "Peter Krnich": "US-SVG",
  "Randy Lemons": "US-SVG",
  "Sam Melyanets": "US-SVG",
  "Trevor Finch": "US-SVG",
  "Tyrone Locke": "US-SVG",

  // US-VO2
  "Brian Konigsford": "US-VO2",
  "Brian McClure": "US-VO2",
  "Corey Miller": "US-VO2",
  "John Vega": "US-VO2",
  "Jonathan Foss": "US-VO2",
  "Joseph Asare": "US-VO2",
  "Milon Horton": "US-VO2",
  "Paul Portuese": "US-VO2",
  "Roberto Chairez": "US-VO2",
  "Rodrigo Alba": "US-VO2",
  "Scott Middleton": "US-VO2",
  "Sean Powell": "US-VO2",

  // US-WCI
  "David Tang": "US-WCI",
  "Richie Calderon": "US-WCI",
  "Roy Alfaro": "US-WCI",
  "Sam Minor": "US-WCI",
  "Sirtaj Iqbal": "US-WCI",
  "Zachary Ball": "US-WCI",

  // US-WJQ
  "Andrew Grasso": "US-WJQ",
  "Anthony Bellingeri": "US-WJQ",
  "CJ Tunstall Jr.": "US-WJQ",
  "Everton Small": "US-WJQ",
  "John Maimone": "US-WJQ",
  "KERON Goodridge": "US-WJQ",
  "Liam Jones": "US-WJQ",
  "Linvol Cummings": "US-WJQ",
  "Obed Amoo": "US-WJQ",
  "R.J. Espina": "US-WJQ",
  "Xavier Adams": "US-WJQ",
};



// ── Canonical alias map — sourced directly from Jira Assets schema 94 (type 323)
// 264 entries covering all site codes, region codes, and shortcodes
// Last updated from assets-locations-v3.json
const DC_ALIAS = {
  "ATL1": "US-SVG", "ATL2": "US-DGV", "ATL3": "US-SKY", "ATL4": "US-AAI",
  "AUS01": "US-AUS", "AUS1": "US-AUS", "BCN1": "ES-BCN", "BOS1": "US-LOE",
  "CA-EAST-01": "CA-GAL", "CA-EAST-01A": "CA-GAL", "CA-GAL": "CA-GAL", "CA-GAL01": "CA-GAL", "CA-TOR01": "CA-GAL",
  "CIN2": "US-CVG", "CMH1": "US-CMH", "CMH3": "US-LNB",
  "DATA HALL D": "US-CVY", "DEN1": "US-NNN",
  "DFW1": "US-PLZ", "DFW1A": "US-DTN", "DFW1B": "US-DAL", "DFW2": "US-MSC", "DFW3": "US-PLZ",
  "ES-AVQ": "ES-AVQ", "ES-AVQ01": "ES-AVQ",
  "ES-BCN": "ES-BCN", "ES-BCN01": "ES-BCN", "ES-BCN02": "ES-BCN", "ES-BCN03": "ES-BCN",
  "EU-NORTH-01": "SE-FAN", "EU-NORTH-01A": "SE-FAN", "EU-NORTH-02A": "NO-OVO",
  "EU-SOUTH-01": "ES-BCN", "EU-SOUTH-01A": "ES-BCN",
  "EU-SOUTH-03": "ES-BCN", "EU-SOUTH-03A": "ES-BCN", "EU-SOUTH-03B": "ES-BCN",
  "EU-SOUTH-04": "ES-AVQ", "EU-SOUTH-04A": "ES-AVQ", "EU-SOUTH04A": "ES-AVQ",
  "EU-WEST-01": "GB-CWY", "EU-WEST-01A": "GB-CWY", "EU-WEST-02": "GB-PPL",
  "EWR1": "US-EWS", "EWR2": "US-PPY",
  "GB-CWY": "GB-CWY", "GB-CWY01": "GB-CWY", "GB-PPL": "GB-PPL", "GB-PPL01": "GB-PPL",
  "GRR2": "US-CDZ", "IAD1": "US-OBG",
  "LAS1": "US-LAS", "LAS2": "US-LAS", "LAS3": "US-LAS",
  "LGA1": "US-WJQ", "LGA2": "US-WJQ", "LHR1": "GB-CWY",
  "NO-OVO": "NO-OVO", "NO-OVO01": "NO-OVO",
  "ORD1": "US-VO2", "ORD2": "US-VO2", "ORD3": "US-WCI", "ORD4": "US-WCI",
  "PDX1": "US-HIO", "PDX2": "US-HIO", "PDX3": "US-HIO", "PDX5": "US-HIO",
  "PHL1": "US-BVI", "PHX1": "US-PHX",
  "RDU1": "US-CVY", "RDU1A": "US-CVY", "RIC1": "US-CSZ",
  "RNO1": "US-RIN", "RNO2": "US-RIN", "RNO2A": "US-RIN",
  "RNO3": "US-SPK", "RNO4": "US-SPK", "RNO5": "US-SPK",
  "SE-FAN": "SE-FAN", "SE-FAN01": "SE-FAN",
  "SEA1": "US-LYF", "SEA2": "US-QNC",
  "SJC1": "US-NKQ", "SJC2": "US-SJC",
  "SPK1": "US-SPK", "SPK2": "US-SPK", "SPK3": "US-SPK",
  "US-AAI": "US-AAI", "US-AAI01": "US-AAI",
  "US-ARQ": "US-ARQ", "US-ARQ01": "US-ARQ",
  "US-ATL": "US-ATL", "US-ATL03": "US-ATL",
  "US-AUS": "US-AUS", "US-AUS01": "US-AUS",
  "US-BVI": "US-BVI", "US-BVI01": "US-BVI",
  "US-CDZ": "US-CDZ", "US-CDZ01": "US-CDZ",
  "US-CENTRAL-01": "US-VO2", "US-CENTRAL-01A": "US-VO2",
  "US-CENTRAL-02": "US-PLZ", "US-CENTRAL-02A": "US-PLZ",
  "US-CENTRAL-03": "US-DTN", "US-CENTRAL-03A": "US-DTN",
  "US-CENTRAL-04": "US-PLZ", "US-CENTRAL-04A": "US-PLZ",
  "US-CENTRAL-05": "US-RIN", "US-CENTRAL-05A": "US-RIN",
  "US-CENTRAL-06A": "US-CHI",
  "US-CENTRAL-07": "US-EVI", "US-CENTRAL-07A": "US-EVI",
  "US-CENTRAL-08": "US-LZL", "US-CENTRAL-08A": "US-LZL", "US-CENTRAL-08B": "US-LZL",
  "US-CENTRAL-09A": "US-HMN", "US-CENTRAL-10A": "US-LBB", "US-CENTRAL-11A": "US-MKO",
  "US-CHI": "US-CHI", "US-CHI01": "US-CHI",
  "US-CLY": "US-CLY", "US-CLY01": "US-CLY",
  "US-CMH": "US-CMH", "US-CMH01": "US-CMH",
  "US-CSZ": "US-CSZ", "US-CSZ01": "US-CSZ",
  "US-CVG": "US-CVG", "US-CVG01": "US-CVG",
  "US-CVY": "US-CVY", "US-CVY01": "US-CVY",
  "US-DAL": "US-DAL", "US-DAL01": "US-DAL",
  "US-DGV": "US-DGV", "US-DGV01": "US-DGV",
  "US-DNN": "US-DNN", "US-DNN01": "US-DNN",
  "US-DTN": "US-DTN", "US-DTN01": "US-DTN",
  "US-EAST-01": "US-OBG", "US-EAST-01A": "US-OBG",
  "US-EAST-02": "US-EWS", "US-EAST-02A": "US-EWS", "US-EAST-02B": "US-EWS",
  "US-EAST-03": "US-BVI", "US-EAST-03A": "US-BVI",
  "US-EAST-04": "US-CSZ", "US-EAST-04A": "US-CSZ", "US-EAST-04B": "US-CSZ",
  "US-EAST-05A": "US-WJQ",
  "US-EAST-06": "US-CVG", "US-EAST-06A": "US-CVG",
  "US-EAST-07": "US-LNB", "US-EAST-07A": "US-LNB",
  "US-EAST-08": "US-CMH", "US-EAST-08A": "US-CMH",
  "US-EAST-09": "US-SVG", "US-EAST-09A": "US-SVG",
  "US-EAST-10": "US-LOE", "US-EAST-10A": "US-LOE",
  "US-EAST-11": "US-ARQ", "US-EAST-11A": "US-ARQ",
  "US-EAST-12": "US-DNN",
  "US-EAST-13": "US-CDZ", "US-EAST-13A": "US-CDZ",
  "US-EAST-14": "US-PPY", "US-EAST-14A": "US-PPY",
  "US-EAST-15A": "US-CLY", "US-EAST-16A": "US-LHS",
  "US-EAST-17A": "US-RRX", "US-EAST-18A": "US-SKY",
  "US-EVI": "US-EVI", "US-EVI01": "US-EVI",
  "US-EWS": "US-EWS", "US-EWS01": "US-EWS",
  "US-HIO": "US-HIO", "US-HIO01": "US-HIO", "US-HIO02": "US-HIO", "US-HIO03": "US-HIO", "US-HIO04": "US-HIO",
  "US-HMN": "US-HMN", "US-HMN01": "US-HMN",
  "US-LAS": "US-LAS", "US-LAS01": "US-LAS", "US-LAS02": "US-LAS", "US-LAS03": "US-LAS",
  "US-LBB": "US-LBB", "US-LBB01": "US-LBB",
  "US-LHS": "US-LHS", "US-LHS01": "US-LHS",
  "US-LNB": "US-LNB", "US-LNB01": "US-LNB",
  "US-LOE": "US-LOE", "US-LOE01": "US-LOE",
  "US-LYF": "US-LYF", "US-LYF01": "US-LYF",
  "US-LZL": "US-LZL", "US-LZL01": "US-LZL",
  "US-MKO": "US-MKO", "US-MKO01": "US-MKO",
  "US-MSC": "US-MSC", "US-MSC01": "US-MSC",
  "US-NKQ": "US-NKQ", "US-NKQ01": "US-NKQ",
  "US-NNN": "US-NNN", "US-NNN01": "US-NNN",
  "US-OBG": "US-OBG", "US-OBG01": "US-OBG",
  "US-PHL01": "US-BVI",
  "US-PHX": "US-PHX", "US-PHX01": "US-PHX",
  "US-PLZ": "US-PLZ", "US-PLZ01": "US-PLZ", "US-PLZ02": "US-PLZ",
  "US-PPY": "US-PPY", "US-PPY01": "US-PPY",
  "US-QNC": "US-QNC", "US-QNC01": "US-QNC",
  "US-RIN": "US-RIN", "US-RIN01": "US-RIN",
  "US-RRX": "US-RRX", "US-RRX01": "US-RRX",
  "US-SJC": "US-SJC", "US-SJC01": "US-SJC",
  "US-SKY": "US-SKY", "US-SKY01": "US-SKY",
  "US-SPK": "US-SPK", "US-SPK01": "US-SPK", "US-SPK02": "US-SPK", "US-SPK03": "US-SPK",
  "US-SVG": "US-SVG", "US-SVG01": "US-SVG",
  "US-TUZ": "US-TUZ", "US-TUZ01": "US-TUZ",
  "US-UYK": "US-UYK", "US-UYK01": "US-UYK",
  "US-VO": "US-VO2", "US-VO201": "US-VO2",
  "US-WCI": "US-WCI", "US-WCI01": "US-WCI",
  "US-WEST-01": "US-LAS", "US-WEST-01A": "US-LAS", "US-WEST-01B": "US-LAS",
  "US-WEST-02": "US-PHX", "US-WEST-02A": "US-PHX", "US-WEST-02B": "US-PHX",
  "US-WEST-03": "US-HIO", "US-WEST-03B": "US-HIO",
  "US-WEST-04": "US-MSC", "US-WEST-04A": "US-MSC",
  "US-WEST-05": "US-LYF",
  "US-WEST-06": "US-HIO", "US-WEST-06A": "US-HIO", "US-WEST-06B": "US-HIO",
  "US-WEST-07": "US-NNN", "US-WEST-07A": "US-NNN",
  "US-WEST-08": "US-NKQ", "US-WEST-08A": "US-NKQ",
  "US-WEST-09": "US-QNC", "US-WEST-09A": "US-QNC", "US-WEST-09B": "US-QNC",
  "US-WEST-10A": "US-TUZ", "US-WEST-11A": "US-SJC",
  "US-WJQ": "US-WJQ", "US-WJQ01": "US-WJQ",
  "US-LAS-02": "US-LAS",
  // Org-chart / legacy aliases not in Assets schema
  "US-RNO":  "US-SPK",
  "US-LLZ":  "US-LZL",
  "US-CYL":  "US-CLY",
  "US-PDX":  "US-HIO",
  "US-PHL":  "US-BVI",
  "US-PDX01":"US-HIO",
  "US-PDX02":"US-HIO",
  "US-PDX03":"US-HIO",
  // Noise values — map to null so they become Unknown
  "UNKNOWN": null, "NONE": null, "3PL": null, "DH1": null, "DH2": null, "DH3": null,
};

// ── canonicalize: maps any raw code → Jira Assets Super Region ──
function canonicalize(raw) {
  if (!raw) return null;
  const key = raw.trim().toUpperCase();
  // 1. Exact match
  if (key in DC_ALIAS) return DC_ALIAS[key] || null;
  // 2. Strip trailing digits:  "US-ARQ01" → "US-ARQ"
  const noDigits = key.replace(/\d+$/, "");
  if (noDigits !== key && noDigits in DC_ALIAS) return DC_ALIAS[noDigits] || null;
  // 3. Strip trailing alphanumeric suffix: "US-WEST-03B" → "US-WEST-03"
  const noSuffix = key.replace(/[A-Z]$/, "");
  if (noSuffix !== key && noSuffix in DC_ALIAS) return DC_ALIAS[noSuffix] || null;
  return null;
}

// ── extractSite: pull canonical site from any raw LoCode string ──
function extractSite(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // 1. Direct canonicalize attempt
  const direct = canonicalize(s);
  if (direct) return direct;

  // 2. Standard colon-separated rack code: "US-ARQ01:dh4:068:42"
  const colonParts = s.split(/:/);
  if (colonParts.length > 1) {
    const c = canonicalize(colonParts[0]);
    if (c) return c;
  }

  // 3. Dotted rack code: "HIO01.DH120.R291.RU16" → try "US-HIO01"
  const dotParts = s.split(/\./);
  if (dotParts.length > 1) {
    const first = dotParts[0].toUpperCase();
    const c = canonicalize("US-" + first) || canonicalize(first);
    if (c) return c;
  }

  // 4. Long hyphenated string — scan all segments for embedded site/region code
  //    e.g. "dh1-r086-ps-01-us-east-11a" or "DHG-R157-PS-04-US-CENTRAL-03A"
  const lc = s.toLowerCase();
  // Look for "us-xxxx-NNA" or "ca-xxxx-NNA" pattern anywhere in the string
  const embeddedRegion = lc.match(/\b((?:us|ca|gb|no|se|es)-[a-z]+-[a-z0-9]+(?:-[a-z0-9]+)*)/);
  if (embeddedRegion) {
    const c = canonicalize(embeddedRegion[1].toUpperCase());
    if (c) return c;
  }

  // 5. Standard XYZ01 prefix (no country prefix): "OBG01.DH4.R50.RU1" → try "US-OBG01"
  const m = s.match(/^([A-Z]{2,5}\d{0,2})[^A-Z]/i);
  if (m) {
    const c = canonicalize("US-" + m[1].toUpperCase());
    if (c) return c;
  }

  // 6. Standard 2-3 char + optional digits prefix: "US-ARQ", "US-HIO01"
  const prefixMatch = s.match(/^([A-Z]{2,3}-[A-Z0-9]{2,6})/i);
  if (prefixMatch) {
    const c = canonicalize(prefixMatch[1].toUpperCase());
    if (c) return c;
    return prefixMatch[1].toUpperCase();
  }

  return null;
}

function lookupAlias(raw) {
  if (!raw) return null;
  return canonicalize(raw);
}

function extractRegion(summary) {
  if (!summary) return null;
  const m1 = summary.match(/Region:\s*([A-Z]{2,3}-[A-Z0-9\-]+)/i);
  if (m1) return m1[1].trim().toUpperCase();
  const m2 = summary.match(/^\[([A-Z]{2,3}-[A-Z0-9\-]+)\]/i);
  if (m2) return m2[1].trim().toUpperCase();
  return null;
}

// Data-hall-only codes that carry no site info on their own
const DATA_HALL_ONLY = new Set(["DH1","DH2","DH3","DH4","DHF","DHG","DATA-HALL-1","DATA-HALL-5","DATA-HALL-120"]);

function resolveLocation(issue) {
  let loc = (issue.location || "Unknown").trim();
  if (!loc || ["unknown","none","null","","n/a"].includes(loc.toLowerCase())) loc = "Unknown";
  if (DATA_HALL_ONLY.has(loc.toUpperCase())) loc = "Unknown";

  // Pass 1: primary LoCode — full extraction pipeline
  if (loc !== "Unknown") {
    const site = extractSite(loc);
    if (site && site !== "Unknown") return site;
  }

  // Pass 2: employee roster fallback (assignee → canonical site)
  const empSite = EMPLOYEE_SITES[issue.assignee];
  if (empSite) {
    const c = canonicalize(empSite);
    if (c) return c;
    return empSite;
  }

  // Pass 3: Asset Data Center field ("US-CENTRAL-03A" etc.)
  if (issue.assetDC) {
    const c = canonicalize(issue.assetDC);
    if (c) return c;
  }

  // Pass 4: region code embedded in ticket summary
  const region = extractRegion(issue.summary);
  if (region) {
    const c = canonicalize(region);
    if (c) return c;
  }

  // Return whatever partial normalization we have, or Unknown
  if (loc !== "Unknown") {
    const site = extractSite(loc);
    return site || loc;
  }
  return "Unknown";
}

// ── SLA MTTR parser ──────────────────────────────────────────────────────
// Uses Jira's Time to Resolution SLA field (customfield_10020).
// Formula per Atlassian docs:
//   Met SLA:     elapsedTime = goalDuration - remaining (positive remaining)
//   Breached:    elapsedTime = goalDuration + |overage| (negative remaining)
// The elapsedTime.millis field gives the actual SLA clock time directly.
function parseSlaHours(slaField) {
  if (!slaField) return null;
  try {
    const sla = typeof slaField === "string" ? JSON.parse(slaField) : slaField;
    const cycles = Array.isArray(sla.completedCycles) ? sla.completedCycles : [];
    if (cycles.length === 0) return null;
    const last = cycles[cycles.length - 1];
    // elapsedTime is the authoritative actual time elapsed per Atlassian SLA engine
    if (last.elapsedTime?.millis != null) return last.elapsedTime.millis / 3600000;
    // Fallback: derive from goalDuration ± remainingTime
    if (last.remainingTime?.millis != null) {
      const goalMs = last.goalDuration?.millis || 0;
      const remMs  = last.remainingTime.millis;
      // If remaining > 0 → met: elapsed = goal - remaining
      // If remaining < 0 → breached: elapsed = goal + |remaining|
      return (goalMs + Math.abs(remMs) - Math.max(0, remMs)) / 3600000;
    }
    return null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────
// PARSERS
// ─────────────────────────────────────────────────────────────
function normalizeIssue(r) { return { ...r, location: resolveLocation(r) }; }

function parseRows(rows) {
  return rows.map(r => normalizeIssue({
    key:r["Issue key"]||r["Key"]||r["key"]||r["Issue Key"]||"",
    summary:r["Summary"]||r["summary"]||"",
    assignee:(r["Assignee"]||r["assignee"]||"Unassigned").trim(),
    reporter:(r["Reporter"]||r["reporter"]||"").trim(),
    priority:r["Priority"]||r["priority"]||"Medium",
    created:(r["Created"]||r["created"]||"").substring(0,10),
    resolved:(r["Resolved"]||r["resolutiondate"]||r["Resolution Date"]||null),
    sla:null,
    issueType:r["Issue Type"]||r["issuetype"]||r["Type"]||"",
    status:r["Status"]||r["status"]||"",
    location:(r["Custom field (LoCode) (Label)"]||r["Custom field (LoCode)"]||r["LoCode"]||r["locode"]||r["Lo Code"]||"").trim()||"Unknown",
    assetDC:(r["Asset Data Center"]||"").trim(),
  })).filter(r=>r.key||r.summary);
}
function parseJSON(json) {
  if (!json.issues||!Array.isArray(json.issues)) throw new Error("Missing 'issues' array in JSON.");
  return json.issues.map(r=>normalizeIssue({
    key:r.key||"",summary:r.summary||"",assignee:r.assignee||"Unassigned",
    reporter:r.reporter||"",priority:r.priority||"Medium",
    created:(r.created||"").substring(0,10),resolved:r.resolved||null,sla:r.sla||null,issueType:r.issueType||"",
    status:r.status||"",location:r.location||"Unknown",assetDC:r.assetDC||"",
  })).filter(r=>r.key||r.summary);
}

// ─────────────────────────────────────────────────────────────
// FILTER PANEL
// ─────────────────────────────────────────────────────────────
function FilterPanel({ locations, assignees, activeLocs, activeAssignees, dctOnly, onToggleLoc, onToggleAssignee, onAllLocs, onNoneLocs, onAllAssignees, onNoneAssignees, onToggleDct }) {
  const [search, setSearch]         = useState("");
  const [locsOpen, setLocsOpen]     = useState(true);
  const [assnOpen, setAssnOpen]     = useState(true);
  const hasDct = DCT_LIST.size > 0;

  const filteredAssignees = useMemo(() =>
    assignees.filter(a => a.toLowerCase().includes(search.toLowerCase())),
    [assignees, search]
  );

  const s = {
    panel:   { background:"#1e293b", border:"1px solid #334155", borderRadius:10, padding:16, marginBottom:12 },
    head:    { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 },
    lbl:     { color:"#94a3b8", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em" },
    actBtn:  { background:"none", border:"none", color:"#6366f1", fontSize:11, cursor:"pointer", padding:0 },
    chev:    { background:"none", border:"none", color:"#64748b", fontSize:12, cursor:"pointer", padding:"0 0 0 8px" },
    search:  { width:"100%", boxSizing:"border-box", background:"#0f172a", border:"1px solid #334155", borderRadius:6, padding:"5px 10px", color:"#e2e8f0", fontSize:12, marginBottom:8 },
    aList:   { maxHeight:180, overflowY:"auto", display:"flex", flexDirection:"column", gap:2 },
    divider: { border:"none", borderTop:"1px solid #334155", margin:"12px 0" },
  };

  const pill = (loc, active) => ({
    padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", border:"none",
    background:active?locColor(loc)+"33":"#0f172a", color:active?locColor(loc):"#475569",
    outline:active?`1px solid ${locColor(loc)}88`:"1px solid #334155", transition:"all .15s",
  });

  return (
    <div style={s.panel}>
      <div>
        <div style={s.head}>
          <span style={s.lbl}>Sites ({activeLocs.size}/{locations.length})</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button style={s.actBtn} onClick={onAllLocs}>all</button>
            <span style={{color:"#334155"}}>·</span>
            <button style={s.actBtn} onClick={onNoneLocs}>none</button>
            <button style={s.chev} onClick={()=>setLocsOpen(v=>!v)}>{locsOpen?"▲":"▼"}</button>
          </div>
        </div>
        {locsOpen && <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {locations.map(loc => <button key={loc} style={pill(loc,activeLocs.has(loc))} onClick={()=>onToggleLoc(loc)}>{loc}</button>)}
        </div>}
      </div>

      <hr style={s.divider}/>

      <div>
        <div style={s.head}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={s.lbl}>Assignees ({activeAssignees.size}/{assignees.length})</span>
            {hasDct && (
              <button onClick={onToggleDct} style={{
                padding:"2px 10px", borderRadius:12, fontSize:10, fontWeight:600, cursor:"pointer", border:"none",
                background:dctOnly?"#6366f1":"#0f172a", color:dctOnly?"#fff":"#64748b",
                outline:dctOnly?"none":"1px solid #334155", transition:"all .15s",
              }}>DCT only</button>
            )}
            {!hasDct && <span style={{ fontSize:10, color:"#475569", fontStyle:"italic" }}>DCT list pending</span>}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button style={s.actBtn} onClick={onAllAssignees}>all</button>
            <span style={{color:"#334155"}}>·</span>
            <button style={s.actBtn} onClick={onNoneAssignees}>none</button>
            <button style={s.chev} onClick={()=>setAssnOpen(v=>!v)}>{assnOpen?"▲":"▼"}</button>
          </div>
        </div>
        {assnOpen && (<>
          <input style={s.search} placeholder="Search assignees…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <div style={s.aList}>
            {filteredAssignees.map(a => {
              const active = activeAssignees.has(a);
              const isDct  = DCT_LIST.has(a);
              return (
                <div key={a} onClick={()=>onToggleAssignee(a)} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 6px", borderRadius:5, cursor:"pointer", background:active?"#312e81":"transparent" }}>
                  <div style={{ width:14, height:14, borderRadius:3, flexShrink:0, background:active?"#6366f1":"transparent", border:active?"2px solid #6366f1":"2px solid #475569", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {active && <span style={{color:"#fff",fontSize:9,fontWeight:700}}>✓</span>}
                  </div>
                  <span style={{ color:"#e2e8f0", fontSize:12, userSelect:"none", flex:1 }}>{a}</span>
                  {isDct && <span style={{ fontSize:9, color:"#6366f1", background:"#6366f122", padding:"1px 5px", borderRadius:3, flexShrink:0 }}>DCT</span>}
                </div>
              );
            })}
          </div>
        </>)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [issues, setIssues]         = useState([]);
  const [loaded, setLoaded]         = useState(false);
  const [fileError, setFileError]   = useState("");
  const [activeTab, setActiveTab]   = useState("planning");
  const [isDragging, setIsDragging] = useState(false);
  const [remapStats, setRemapStats] = useState(null);
  const [loadMode, setLoadMode]     = useState("jira"); // "jira" | "file"
  const [lastFetched, setLastFetched] = useState(null);
  const [dataSource, setDataSource] = useState(null); // "jira" | "file"
  const [ticketDerivedSites, setTicketDerivedSites] = useState({});

  // Trends tab state
  const [trendsData,   setTrendsData]   = useState(null);
  const [trendsWin,    setTrendsWin]    = useState("30d");
  const [trendsRegion, setTrendsRegion] = useState("All");
  const [trendsSort,   setTrendsSort]   = useState("vol");
  const [trendsLoading,setTrendsLoading]= useState(false);
  const [trendsSite,   setTrendsSite]   = useState("");

  // Jira fetch state
  const [fetchProgress, setFetchProgress] = useState(null); // { done, total, status }
  const [isFetching, setIsFetching]       = useState(false);
  const [fetchError, setFetchError]       = useState("");

  const [activeLocs, setActiveLocs]           = useState(new Set());
  const [activeAssignees, setActiveAssignees] = useState(new Set());
  const [filtersOpen, setFiltersOpen]         = useState(true);
  const [dctOnly, setDctOnly]                 = useState(false);

  const [selectedPeriod,  setSelectedPeriod]  = useState(365);
  const [planSortCol, setPlanSortCol] = useState('Total');
  const [planSortDir, setPlanSortDir] = useState('desc');
  const [selectedFormula, setSelectedFormula] = useState(HC_FORMULAS[1]);
  const [customTarget,    setCustomTarget]    = useState(10);

  // Persist Jira config in sessionStorage
  const [jiraConfig, setJiraConfig] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("jira_config") || "{}"); }
    catch { return {}; }
  });
  const updateConfig = (patch) => {
    const next = { ...jiraConfig, ...patch };
    setJiraConfig(next);
    try { sessionStorage.setItem("jira_config", JSON.stringify(next)); } catch {}
  };

  const DEFAULT_JQL = 'project IN (service-desk-albatross, service-desk-eagle, service-desk-heron, service-desk-osprey, service-desk-phoenix, service-desk-snipecustomer, dct-ops) AND project != GSOC AND resolved >= -365d ORDER BY created DESC';
  const cfg = {
    proxyUrl: jiraConfig.proxyUrl || "http://localhost:3000",
    jql:      jiraConfig.jql      || DEFAULT_JQL,
  };

  const resetCache = () => { Object.keys(locColorCache).forEach(k=>delete locColorCache[k]); colorIdx=0; };

  // ── Build employee→site map from ticket data ───────────────
  // For each assignee, vote on their primary site weighted by recency.
  // This is the ground truth when Assets is incomplete.
  const buildTicketDerivedSites = (parsed) => {
    const today = new Date();
    const d90  = new Date(today - 90  * 86400000).toISOString().slice(0,10);
    const d180 = new Date(today - 180 * 86400000).toISOString().slice(0,10);
    const INVALID = new Set(['Unknown','Unassigned']);
    const votes = {};

    parsed.forEach(issue => {
      const a = issue.assignee;
      const s = issue.location;
      if (!a || a === 'Unassigned' || !s || INVALID.has(s) || s === 'Unknown') return;
      const site = canonicalize(s) || s;
      if (!site || site === 'Unknown') return;
      const w = issue.created >= d90 ? 3 : issue.created >= d180 ? 2 : 1;
      if (!votes[a]) votes[a] = {};
      votes[a][site] = (votes[a][site] || 0) + w;
    });

    const map = {};
    Object.entries(votes).forEach(([a, sv]) => {
      const best = Object.entries(sv).sort((x,y)=>y[1]-x[1])[0];
      if (best) map[a] = best[0];
    });
    return map;
  };

  // ── Shared loader ──────────────────────────────────────────
  const loadParsed = (parsed, source) => {
    if (!parsed.length) { setFileError("No issues found."); return false; }
    setRemapStats({ total:parsed.length, resolved:parsed.filter(i=>i.location!=="Unknown").length });
    setIssues(parsed);
    setTicketDerivedSites(buildTicketDerivedSites(parsed));
    setActiveLocs(new Set([...new Set(parsed.map(r=>r.location))]));
    setActiveAssignees(new Set([...new Set(parsed.map(r=>r.assignee))]));
    setDataSource(source);
    setLoaded(true);
    return true;
  };

  // ── Proxy health check ─────────────────────────────────────
  const testProxy = async () => {
    const base = (jiraConfig.proxyUrl || "http://localhost:3000").replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/rest/api/3/serverInfo`, { headers:{ Accept:"application/json" } });
      const d = await r.json();
      setFetchError("");
      alert(`Proxy working!
Connected to: ${d.baseUrl || base}
Jira version: ${d.version || "unknown"}`);
    } catch(err) {
      setFetchError(`Proxy unreachable: ${err.message}. Make sure jira-proxy.js is running on port 3010.`);
    }
  };

  // ── Live Jira fetch ────────────────────────────────────────
  const fetchFromJira = async () => {
    const apiBase = (jiraConfig.proxyUrl || "http://localhost:3000").replace(/\/$/, "");

    setFetchError("");
    setIsFetching(true);
    setFetchProgress({ done:0, total:null, status:"Connecting to server..." });

    try {
      // ── Load employee and server data from backend ──
      setFetchProgress({ done:0, total:null, status:"Loading employee & server data..." });
      const [empRes, srvRes] = await Promise.all([
        fetch(`${apiBase}/api/employees`),
        fetch(`${apiBase}/api/servers`),
      ]);
      if (empRes.ok) {
        const empData = await empRes.json();
        // Merge backend employees into EMPLOYEE_SITES at runtime
        Object.assign(EMPLOYEE_SITES, empData.employees || {});
        // Populate DCT_LIST from API (title-based, no hardcoded names)
        if (empData.dctList && empData.dctList.length > 0) {
          DCT_LIST.clear();
          empData.dctList.forEach(name => DCT_LIST.add(name));
        }
      }
      if (srvRes.ok) {
        const srvData = await srvRes.json();
        // Merge backend server counts into SERVER_COUNTS at runtime
        Object.assign(SERVER_COUNTS, srvData.servers || {});
      }

      // ── Fetch tickets from backend — paginated to avoid memory crash ──
      const PAGE_LIMIT = 2000;
      let allTickets = [];
      let page = 0;
      let total = null;

      while (true) {
        setFetchProgress({ done: allTickets.length, total, status: `Loading tickets from database... ${allTickets.length.toLocaleString()}${total ? " / " + total.toLocaleString() : ""}` });
        const ticketRes = await fetch(`${apiBase}/api/tickets?page=${page}&limit=${PAGE_LIMIT}`);
        if (!ticketRes.ok) throw new Error(`Server returned HTTP ${ticketRes.status}`);
        const ticketData = await ticketRes.json();
        const batch = ticketData.tickets || [];
        allTickets = allTickets.concat(batch);
        total = ticketData.total || null;
        if (!ticketData.hasMore || batch.length === 0) break;
        page++;
      }

      setFetchProgress({ done: allTickets.length, total: allTickets.length, status: "Processing tickets..." });

      const parsed = allTickets.map(ticket => {
        return normalizeIssue({
          key:       ticket.key        || "",
          summary:   ticket.summary    || "",
          assignee:  ticket.assignee   || "Unassigned",
          reporter:  ticket.reporter   || "",
          priority:  ticket.priority   || "Medium",
          status:    ticket.status     || "",
          issueType: ticket.issue_type || "",
          created:   (ticket.created_at || "").substring(0, 10),
          resolved:  ticket.resolved_at || null,
          location:  ticket.location   || "Unknown",
          assetDC:   "",
          sla:       null,
        });
      }).filter(r => r.key || r.summary);

      setLastFetched(new Date());
      setIsFetching(false);
      setFetchProgress(null);
      resetCache();
      loadParsed(parsed, "jira");

    } catch(err) {
      setIsFetching(false);
      setFetchProgress(null);
      setFetchError(err.message || String(err));
    }
  };

    // ── File upload ────────────────────────────────────────────
  const processFile = useCallback(file => {
    if (!file) return;
    setFileError(""); resetCache();
    const load = parsed => loadParsed(parsed, "file");
    if (file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = e => { try { load(parseJSON(JSON.parse(e.target.result))); } catch(err) { setFileError(err.message); } };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const rows = parseCSVText(e.target.result);
          if (!rows.length) { setFileError("No rows found in CSV."); return; }
          load(parseRows(rows));
        } catch(err) { setFileError("CSV parse error: " + err.message); }
      };
      reader.readAsText(file);
    }
  }, []);

  const onFileInput = e => processFile(e.target.files[0]);
  const onDrop      = e => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); };

  // ── Period filter ──────────────────────────────────────────
  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - selectedPeriod);
    return d.toISOString().substring(0, 10);
  }, [selectedPeriod]);

  const periodIssues = useMemo(() =>
    // Filter by resolved date when available (matches JQL), fall back to created
    issues.filter(i => {
      const d = i.resolved ? i.resolved.slice(0,10) : i.created;
      return !d || d >= cutoffDate;
    }),
    [issues, cutoffDate]
  );

  const locations = useMemo(() => [...new Set(periodIssues.map(r=>r.location))].sort(), [periodIssues]);
  const assignees = useMemo(() => {
    const all = [...new Set(periodIssues.map(r=>r.assignee))].sort();
    return dctOnly && DCT_LIST.size > 0 ? all.filter(a=>DCT_LIST.has(a)) : all;
  }, [periodIssues, dctOnly]);

  const filtered = useMemo(() =>
    periodIssues.filter(r => activeLocs.has(r.location) && activeAssignees.has(r.assignee)),
    [periodIssues, activeLocs, activeAssignees]
  );

  const toggleLoc      = loc => setActiveLocs(s=>{const n=new Set(s);n.has(loc)?n.delete(loc):n.add(loc);return n;});
  const toggleAssignee = a   => setActiveAssignees(s=>{const n=new Set(s);n.has(a)?n.delete(a):n.add(a);return n;});

  const handleToggleDct = () => {
    setDctOnly(v => {
      const next = !v;
      if (next && DCT_LIST.size > 0) {
        setActiveAssignees(new Set([...new Set(periodIssues.map(r=>r.assignee))].filter(a=>DCT_LIST.has(a))));
      } else {
        setActiveAssignees(new Set([...new Set(periodIssues.map(r=>r.assignee))]));
      }
      return next;
    });
  };

  // ── HC target ─────────────────────────────────────────────
  const hcTarget = selectedFormula.id === "custom" ? (parseFloat(customTarget) || 10) : selectedFormula.tpw;

  // ── Derived metrics ────────────────────────────────────────
  const locTotals      = useMemo(()=>{const m={};filtered.forEach(r=>{m[r.location]=(m[r.location]||0)+1;});return m;},[filtered]);
  const assigneeTotals = useMemo(()=>{const m={};filtered.forEach(r=>{m[r.assignee]=(m[r.assignee]||0)+1;});return m;},[filtered]);
  const byAssigneeLoc  = useMemo(()=>{const m={};filtered.forEach(r=>{if(!m[r.assignee])m[r.assignee]={};m[r.assignee][r.location]=(m[r.assignee][r.location]||0)+1;});return m;},[filtered]);
  const locAssignees   = useMemo(()=>{const m={};filtered.forEach(r=>{if(!m[r.location])m[r.location]=new Set();m[r.location].add(r.assignee);});return m;},[filtered]);

  // ── Authoritative roster headcount ────────────────────────
  // Primary: ticket-derived site map (built from actual resolved tickets — covers all assignees)
  // Fallback: static EMPLOYEE_SITES (from Jira Assets — may be incomplete)
  // Merged: ticket-derived takes precedence, Assets fills gaps for staff with no tickets
  const headcount = useMemo(() => {
    const merged = { ...EMPLOYEE_SITES };  // start with static Assets data
    Object.entries(ticketDerivedSites).forEach(([name, site]) => {
      merged[name] = site;  // ticket data overrides — more current
    });
    const m = {};
    Object.values(merged).forEach(site => {
      if (site) m[site] = (m[site]||0) + 1;
    });
    return m;
  }, [ticketDerivedSites]);

  // ── DCT headcount per site ────────────────────────────────
  // DCT HC = DCT_LIST members mapped to each site.
  // Primary source: EMPLOYEE_SITES (Assets). 
  // Fallback for unmapped DCTs: ticketDerivedSites (if they resolved tickets, count them).
  const dctHcBySite = useMemo(() => {
    const m = {};
    const mergedSites = { ...EMPLOYEE_SITES, ...ticketDerivedSites };
    DCT_LIST.forEach(name => {
      const site = mergedSites[name];
      if (site) m[site] = (m[site]||0) + 1;
    });
    return m;
  }, [ticketDerivedSites]);

  // DCT members active in tickets this period (per site)
  const dctActiveBySite = useMemo(() => {
    const m = {};
    filtered.forEach(r => {
      if (!DCT_LIST.has(r.assignee)) return;
      if (!m[r.location]) m[r.location] = new Set();
      m[r.location].add(r.assignee);
    });
    return m;
  }, [filtered]);

  const weeks       = selectedPeriod / 7;
  const wkAvg = useMemo(()=>{ const m={}; Object.keys(locTotals).forEach(l=>{m[l]=((locTotals[l]||0)/weeks).toFixed(1);}); return m; },[locTotals,weeks]);

  const tppw = useMemo(() => {
    const m = {};
    Object.keys(locTotals).forEach(l => {
      const roster = headcount[l] || 0;
      const active = locAssignees[l]?.size || 1;
      const denom  = roster > 0 ? roster : active;
      m[l] = ((locTotals[l]||0) / denom / weeks).toFixed(1);
    });
    return m;
  }, [locTotals, headcount, locAssignees, weeks]);

  // ── MTTR (Mean Time to Resolution) per site ─────────────────
  // Per Atlassian JSM docs: MTTR = mean of each ticket's SLA elapsed time.
  // Primary: SLA field (customfield_10020) — accounts for calendar & pause conditions.
  // Fallback: wall-clock (resolutiondate - created) for tickets without SLA data.
  const mttrBySite = useMemo(() => {
    const sums = {}, counts = {}, slaCounts = {};
    filtered.forEach(r => {
      // Try SLA field first
      const slaHours = parseSlaHours(r.sla);
      let hours = slaHours;
      let usedSla = slaHours != null;

      // Fall back to wall-clock if no SLA
      if (hours == null && r.resolved && r.created) {
        const ms = new Date(r.resolved) - new Date(r.created);
        if (ms > 0) hours = ms / 3600000;
      }

      if (hours == null || hours < 0) return;

      sums[r.location]      = (sums[r.location]      || 0) + hours;
      counts[r.location]    = (counts[r.location]     || 0) + 1;
      if (usedSla) slaCounts[r.location] = (slaCounts[r.location] || 0) + 1;
    });
    const m = {};
    Object.keys(sums).forEach(loc => {
      const n = counts[loc];
      const slaP = slaCounts[loc] || 0;
      m[loc] = {
        avgHours: sums[loc] / n,
        sampleSize: n,
        slaCount: slaP,
        source: slaP > n / 2 ? "SLA" : "wall-clock",
      };
    });
    return m;
  }, [filtered]);
  const visLocs = useMemo(() => {
    const locs = Object.keys(locTotals);
    const dir = planSortDir === 'desc' ? -1 : 1;
    return locs.sort((a, b) => {
      let va, vb;
      switch (planSortCol) {
        case 'Site':     va=a; vb=b; return dir*(va<vb?-1:va>vb?1:0);
        case 'Total':    va=locTotals[a]||0; vb=locTotals[b]||0; break;
        case '% Vol':    va=locTotals[a]||0; vb=locTotals[b]||0; break;
        case 'Avg/Day':  va=locTotals[a]||0; vb=locTotals[b]||0; break;
        case 'Avg/Wk':   va=parseFloat(wkAvg[a])||0; vb=parseFloat(wkAvg[b])||0; break;
        case 'Avg/Mo':   va=locTotals[a]||0; vb=locTotals[b]||0; break;
        case 'Roster HC':va=headcount[a]||0; vb=headcount[b]||0; break;
        case 'Active':   va=locAssignees[a]?.size||0; vb=locAssignees[b]?.size||0; break;
        case 'T/P/W (Roster)': va=parseFloat(tppw[a])||0; vb=parseFloat(tppw[b])||0; break;
        case 'MTTR':     va=mttrBySite[a]?.avgHours??Infinity; vb=mttrBySite[b]?.avgHours??Infinity; break;
        case 'Suggested HC': {
          const wA=parseFloat(wkAvg[a])||0, wB=parseFloat(wkAvg[b])||0;
          va=Math.max(1,Math.ceil(wA/hcTarget)); vb=Math.max(1,Math.ceil(wB/hcTarget)); break;
        }
        case 'DCT HC':   va=dctHcBySite[a]||0; vb=dctHcBySite[b]||0; break;
        case 'DCT Active':va=dctActiveBySite[a]?.size||0; vb=dctActiveBySite[b]?.size||0; break;
        case 'Servers':  va=SERVER_COUNTS[a]||0; vb=SERVER_COUNTS[b]||0; break;
        case 'Srvr/HC':  va=parseFloat(serversByHc[a])||0; vb=parseFloat(serversByHc[b])||0; break;
        case 'Gap': {
          const rA=headcount[a]||locAssignees[a]?.size||1;
          const rB=headcount[b]||locAssignees[b]?.size||1;
          va=Math.max(1,Math.ceil((parseFloat(wkAvg[a])||0)/hcTarget))-rA;
          vb=Math.max(1,Math.ceil((parseFloat(wkAvg[b])||0)/hcTarget))-rB; break;
        }
        default:         va=locTotals[a]||0; vb=locTotals[b]||0;
      }
      return dir*(va-vb);
    });
  }, [locTotals, planSortCol, planSortDir, wkAvg, headcount, locAssignees, tppw, mttrBySite, hcTarget]);
  const visAssignees= useMemo(()=>Object.keys(assigneeTotals).sort((a,b)=>(assigneeTotals[b]||0)-(assigneeTotals[a]||0)),[assigneeTotals]);
  const MAX_LOC     = Math.max(1,...Object.values(locTotals));

  // ── Servers per HC ratio ──────────────────────────────────
  const serversByHc = useMemo(() => {
    const m = {};
    Object.keys(locTotals).forEach(loc => {
      const servers = SERVER_COUNTS[loc] || 0;
      const hc      = headcount[loc] || locAssignees[loc]?.size || 1;
      if (servers > 0) m[loc] = (servers / hc).toFixed(1);
    });
    return m;
  }, [locTotals, headcount, locAssignees]);

  // tppw: always use roster headcount when available, fall back to active assignees
  // This ensures T/P/W reflects true per-person load against full staff, not just active workers


  // Format MTTR for display: < 24h → hours, >= 24h → days
  const fmtMttr = (avgHours) => {
    if (avgHours == null) return "—";
    if (avgHours < 1)    return `${Math.round(avgHours * 60)}m`;
    if (avgHours < 24)   return `${avgHours.toFixed(1)}h`;
    return `${(avgHours / 24).toFixed(1)}d`;
  };
  // MTTR color: green < 48h, yellow 48-120h, red > 120h
  const mttrColor = (avgHours) => {
    if (avgHours == null) return "#64748b";
    if (avgHours <= 48)  return "#10b981";
    if (avgHours <= 120) return "#f59e0b";
    return "#ef4444";
  };
  // Global MTTR across all filtered sites
  const globalMttr = useMemo(() => {
    let totalHours = 0, n = 0, slaCount = 0;
    filtered.forEach(r => {
      const slaHours = parseSlaHours(r.sla);
      let h = slaHours;
      if (h == null && r.resolved && r.created) {
        const ms = new Date(r.resolved) - new Date(r.created);
        if (ms > 0) h = ms / 3600000;
      }
      if (h == null || h < 0) return;
      if (slaHours != null) slaCount++;
      totalHours += h; n++;
    });
    return n > 0 ? { avgHours: totalHours / n, n, slaCount } : null;
  }, [filtered]);

  const bg    = { background:"#0f172a", color:"#e2e8f0", fontFamily:"system-ui,sans-serif", minHeight:"100vh", padding:16 };
  const card  = (extra={}) => ({ background:"#1e293b", border:"1px solid #334155", borderRadius:10, padding:16, marginBottom:12, ...extra });
  const tabBtn= t => ({ padding:"7px 16px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:600, fontSize:12, background:activeTab===t?"#6366f1":"#1e293b", color:activeTab===t?"#fff":"#94a3b8" });
  const badge = (color, small) => ({ background:color+"22", color, border:`1px solid ${color}44`, borderRadius:4, padding:small?"1px 6px":"2px 8px", fontSize:small?10:11, fontWeight:600, display:"inline-block", whiteSpace:"nowrap" });

  // ── Load screen ────────────────────────────────────────────
  if (!loaded) return (
    <div style={bg}>
      <div style={{ maxWidth:600, margin:"40px auto" }}>
        <div style={{ fontSize:22, fontWeight:800, color:"#f1f5f9", marginBottom:4 }}><img src="data:image/png;base64,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" style={{width:22,height:22,borderRadius:"50%",marginRight:2,verticalAlign:"middle"}} /> DCOPS Jira Dashboard</div>
        <div style={{ color:"#64748b", fontSize:13, marginBottom:20 }}>CoreWeave · Data Center Operations</div>

        {/* Mode tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:16 }}>
          {[["jira","⚡ Live from Jira"],["file","📂 Upload file"]].map(([m,l])=>(
            <button key={m} onClick={()=>setLoadMode(m)} style={{
              padding:"8px 18px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:600, fontSize:13,
              background:loadMode===m?"#6366f1":"#1e293b", color:loadMode===m?"#fff":"#94a3b8",
            }}>{l}</button>
          ))}
        </div>

        {/* ── Live Jira tab ── */}
        {loadMode === "jira" && (
          <div style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:12, padding:20 }}>
            <div style={{ background:"#0f172a", border:"1px solid #6366f133", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12 }}>
              <div style={{ color:"#a78bfa", fontWeight:600, marginBottom:6 }}>Step 1 — start the server (or use Docker):</div>
              <code style={{ color:"#7dd3fc", fontSize:11, lineHeight:1.8, wordBreak:"break-all" }}>
                docker compose up   # or: npm start
              </code>
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ display:"block", color:"#94a3b8", fontSize:11, marginBottom:5 }}>Step 2 — server URL</label>
              <input type="text" value={cfg.proxyUrl}
                onChange={e=>updateConfig({ proxyUrl:e.target.value })}
                style={{ width:"100%", boxSizing:"border-box", background:"#0f172a", border:"1px solid #334155", color:"#e2e8f0", borderRadius:7, padding:"8px 12px", fontSize:13 }}/>
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ display:"block", color:"#94a3b8", fontSize:11, marginBottom:5 }}>JQL query</label>
              <textarea value={cfg.jql} rows={3}
                onChange={e=>updateConfig({ jql:e.target.value })}
                style={{ width:"100%", boxSizing:"border-box", background:"#0f172a", border:"1px solid #334155", color:"#e2e8f0", borderRadius:7, padding:"8px 12px", fontSize:11, fontFamily:"monospace", resize:"vertical" }}/>
            </div>

            {isFetching && fetchProgress && (
              <div style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#94a3b8", marginBottom:6 }}>
                  <span>{fetchProgress.status}</span>
                  <span>{fetchProgress.done.toLocaleString()}{fetchProgress.total?" / "+fetchProgress.total.toLocaleString():""}</span>
                </div>
                <div style={{ background:"#0f172a", borderRadius:4, height:6, overflow:"hidden" }}>
                  <div style={{
                    height:"100%", borderRadius:4, background:"#6366f1", transition:"width .3s",
                    width: fetchProgress.total ? `${Math.round(fetchProgress.done/fetchProgress.total*100)}%` : "30%",
                    animation: !fetchProgress.total ? "pulse 1.5s ease-in-out infinite" : "none",
                  }}/>
                </div>
                <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
              </div>
            )}

            {fetchError && (
              <div style={{ background:"#ef444422", border:"1px solid #ef444444", borderRadius:8, padding:"10px 14px", marginBottom:12, color:"#fca5a5", fontSize:12, lineHeight:1.6 }}>
                <strong>Error:</strong> {fetchError}
                {fetchError.includes("fetch") && <div style={{ marginTop:6, color:"#94a3b8" }}>Make sure the server is running: <code style={{color:"#7dd3fc"}}>docker compose up</code> or <code style={{color:"#7dd3fc"}}>npm start</code></div>}
              </div>
            )}

            <button onClick={fetchFromJira} disabled={isFetching} style={{
              width:"100%", padding:"10px", borderRadius:8, border:"none", cursor:isFetching?"not-allowed":"pointer",
              background:isFetching?"#334155":"#6366f1", color:"#fff", fontWeight:700, fontSize:14,
              opacity:isFetching?0.7:1, transition:"all .15s",
            }}>
              {isFetching ? "Fetching…" : "⚡ Fetch & Analyze"}
            </button>
            <button onClick={testProxy} disabled={isFetching} style={{
              width:"100%", marginTop:8, padding:"8px", borderRadius:8, border:"1px solid #334155",
              cursor:"pointer", background:"transparent", color:"#94a3b8", fontSize:12,
            }}>
              🔌 Test proxy connection
            </button>
          </div>
        )}

        {/* ── File upload tab ── */}
        {loadMode === "file" && (
          <div>
            <div onDragOver={e=>{e.preventDefault();setIsDragging(true);}} onDragLeave={()=>setIsDragging(false)} onDrop={onDrop}
              onClick={()=>document.getElementById("fi").click()}
              style={{ border:`2px dashed ${isDragging?"#6366f1":"#334155"}`, borderRadius:12, padding:"40px 24px", textAlign:"center", background:isDragging?"#1e293b":"#111827", transition:"all .2s", cursor:"pointer" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📂</div>
              <div style={{ color:"#e2e8f0", fontWeight:600, marginBottom:6 }}>Drop your file here or click to browse</div>
              <div style={{ color:"#64748b", fontSize:12 }}>Accepts <strong style={{color:"#94a3b8"}}>jira-data.json</strong> (from jira-fetch.js) or Jira <strong style={{color:"#94a3b8"}}>.csv</strong></div>
              <input id="fi" type="file" accept=".csv,.json" style={{display:"none"}} onChange={onFileInput}/>
            </div>
            {fileError && <div style={{ background:"#ef444422", border:"1px solid #ef444444", borderRadius:8, padding:12, marginTop:12, color:"#fca5a5", fontSize:12 }}>{fileError}</div>}
          </div>
        )}
      </div>
    </div>
  );

  // ── Dashboard ──────────────────────────────────────────────
  return (
    <div style={bg}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:8 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:"#f1f5f9" }}><img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAgkCCUDASIAAhEBAxEB/8QAHQABAAEEAwEAAAAAAAAAAAAAAAUEBgcIAgMJAf/EAE8QAQACAQICBgUHCQcCBQMDBQABAgMEBQYRBxIhMUFRCBMiYXEVFiMygZHRFEJSVWJyk6HBM0NUgpKUsSThF3OD0vAJNKJTsrPxJmPCw//EABoBAQADAQEBAAAAAAAAAAAAAAADBAUCAQb/xAAwEQEAAgICAQMBCAIDAQADAAAAAQIDEQQSMRMhQVEFFCJCUmGRsRUyQ3GBMyOhwf/aAAwDAQACEQMRAD8A0yAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB9rW1p5VrMz7oB8FRTR6q/1cF/t7P+XdTa9Tb600r8ZSRivPiHE3rHyoRK02j9PP91XdTatNH1pyW+MpI42SfhxOekIQXDTQ6SvdhrPxmZd1cOKn1cVK/CsQkjh2+ZczyI+IW1Wl7fVpa3wjm7a6TVW7sF/tjkuMdxw4+ZcTyJ+IQNdt1c9+OI+Nodldq1E998cfbP4JodxxMcOZz3RNdot+dniPhXm512jH+dmtPwjkkx3HHxx8OfWv9UfG1aeO++Sftj8HONs0kfm2n/MrR1GHHHw89S/1Usbfo4/uY/1S5Ro9LH9xT7lQPfTpHw872+rpjS6aI/8At8X+iHKMGGO7Dj/0w7B11j6PNy4erx//AKdfuferX9GPuch7qHm3yIiO6Ih9AAAHya1nvrH3Pk0pPfSv3OQaHCcWKY5Tjp/phxnT4J78OOf8sO0edYe7l0zpdNP9xj/0w4zodJP9xVUDzpX6Ha31Uk7do5/uuXwtLhO16We6Lx8LK4czip9HXqW+qOttOD83Jkj48nC20V/NzzHxr/3Sg5nj45+Hvq3+qHttGT83NSfjHJ122vVR3Tjt8LJwczxccuoz3W/bb9XX+5mfhMS6rabUV+thyR/llco4nh1+JdRyLfMLWmJieUxMT73xdMxExymImPe676bT3+thxz/lhxPDn4l1HJj5hbQn77dpLf3c1+FpdN9pwz9TJevx5Sjni5IdxnohhJ32jJH1M1Z+McnRfbdXXupFvhZHODJHw6jLSflRjtvp89Pr4bx7+q6kcxMeXcTE+AB49AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB2YsObL/Z47W+EKrFtept9bq0j3z+DuuO1vEOZvWPMqETGLaccf2mW1vhHJU4tFpcfdhrM/tdv/ACmrxLz59kU56x4QFKXvPKlbWnyiOaox6DV3/uprH7U8k/ERWOURER5Q+pq8OvzKOeRPxCHx7Rkn+0y1r8I5qnHtWnr9a17/AG8leJq8fHHwjnNefl0Y9HpafVwU+2Of/LurEVjlWIiPc+iWKxHiHEzM+QB68AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHC+PHf6+OtvjHNzDWxS5Nv0l/7rqz+zPJT5Npxz/Z5bV+Mc0kI7YcdvMO4yWj5QmTatRX6lqX+3lKnyaTU4/rYb/GI5/8LjENuJSfCSORaPK1Z7J5SLnyYseSPpMdbfGOamybbpb91JpP7MobcO0eJSRyI+YQIlMu0T/dZon3WhS5dv1WP+760edZ5obYclfMJIy1n5Uo+2ras8rVms+Uw+IkgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADtw6fPm/s8VrR58uz73sRM+0PJmI8uoSWHactu3LkrT3R2yrMO3aXH2zSbz52lPXjZLfsitnrCDpS955Ura0+URzVWLbdVfvrFI/alO1rWkcq1iseURyfVivErH+0orcifiEbi2nHHbly2t7ojkq8Wj02L6mGvPznt/5d4nripXxCKclreZAEjgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABxvSt45XrFo8pjmpsu3aXJ+ZNJ86zyVY5tStvMPYtMeJROXabR24ssT7rRyUeXRanF9bFaY869q4hBbi0nx7JYz2jytUXNlwYcv9pjrb3zHao821YLduO1qT98K9uJePHumryKz5Qorc22anH21iMkfsz2qS9L0t1b1tWfKY5K9qWr5hLFot4lxAcugAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHZhwZs08sWO1vfEdj2ImfaCZ06xJ4NpvPbmyRWPKvbKuwaLTYeU1xxM+du2U9OLe3n2Q2z1jwhMGlz5v7PFaY8+6Fdg2m09ubLEe6v4pYWqcWkefdBbPafCnw6LTYu2uKJnzt2qgFiKxXxCKZmfIA9eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADjelL16t6xaPKY5uQCiz7ZpsnbSJxz7u5Q5trz07cc1yR7uyU2Ib8fHb4SVzXqtfJjvjt1b0tWfKY5OK6L0revVvWLR5THNR59s0+TnNOeOfd2x9ytfiWj/WU9eRE+UGK3Ptuox9tIjJH7Pf9yjtW1bdW1ZrMeEwq2pavmE1bRbw+AOXQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAO7T6bPnn6PHMx590JHT7TWOU579af0a933paYb38Q4tkrXyia1ta3VrWbTPhEK3T7ZqMnbfljr7+/wC5MYcOLDXljpWse6HYt04kR/tKvbkT8KPT7dpsXbavrLedvwVcRERyiIiI8IfRZrStfEIJtNvIA6eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADhlxY8teWSlbR74cwmN+TwjdRtWO3OcN5pPlPbCP1Gj1GDnN8czX9KvbC4hXvxqW8eyaue0efdaouHUaLT5uc2xxW36VeyUdqNry05zitGSPLulUvxr18e6euatkeOWSl8dures1nymHFXTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPtK2vaK1rNpnwiAfBI6ba8t/azW9XHlHbKS0+lwYI+jpHP9Ke2VnHxr28+yG2etfHuiNNt2oy8ptHq6+du/7klp9u0+LlNq+st527vuVgt049Kfur2zWs+RERHKH0E6IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwy48eWvVyUraPfCP1G1UnnOC/Vn9G3bCTHF8db+YdVvavhbeo02bBP0mOYjz8HSumYiY5THOFHqdtwZec0+it7u77lO/EmP9ZWK8iPzIIVWp0Oowc5mvWr+lXtUqras1nUrETE+ABy9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAc8WPJlt1cdJtPlBEbHByx475LdXHWbT5RCT0u1d1tRb/LX8UlixY8VerjpFY9y1j4tre9vZBfPEeEZptqtPtai3V/Zr3/eksOHFhr1cVIr8O+XYLtMVKeIVrZLW8gCRwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKXU6HT5+2a9S36VexVDy1YtGpexaY94QOq27Ph52rHrK+de/7lGupT6nR4NR23ryt+lXslTycT5osU5H6luit1W3Z8PO1PpK+7v8AuUSnalqTqYWK2i3gAcugAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH2tZtaK1iZme6IB8csdL5LdWlZtPlEJDSbXe/K2eepH6Md6Uw4cWGvVxUisf8rOPi2t729kF88V8e6N0u1TPK2oty/Zr+KTxYseKnVx0ise5zF6mKtPEK1r2t5AEjgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU+q0eDURM2ryt+lHeqB5asWjUvYmY94QOq2/Ph52rHrKecd/3KNdSl1ehwajnMx1L/pVU8nE+aLFOR8WW+KrV6LPp+czHWp+lClU7Vms6lZiYmNwAOXoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKjS6TNqJ9ivKvjae5L6TQ4dPyty69/0p/omx4LZP8ApFfLWqO0m3Zs3K2T6Onvjtn7EtptNh09eWOnb42nvl3DQx4a4/HlVvltYASowAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQ6vbsObnbH9Hf3d0/YrhzalbxqYe1tNZ3C29Tps2ntyyU5R4THdLpXTatbVmtoiYnviUbrNried9PPKf0Z7vsUcnFmPevutUzxPtZEDllx3x3mmSs1tHhLiqTGlgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABX6PbcmXlfLzx08vGXVKWvOoc2tFY3KjxY8mW8Ux1m1p8kro9spTlfUTF7fox3R+KuwYceCnUxUisf8uxfxcatfe3vKrfPNvaHyIiIiIiIiPCH0FpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA68+DFnp1ctItHh5wiNZtuTFzvi55KeXjCbEWTDXJ5d0yWp4WqJ/WaHDqOdvqZP0o8fih9Vpc2ntyyV7PC0d0s/Lgtj/6XKZa3dACFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAR2zygB26bT5dRfq468/OfCFbotstflfUc61/R8Z/BLY6Ux0ilKxWseELWLjTb3t7QgyZ4j2hS6PQYtPytPt5POfD4KwF+tYrGoVLWm07kAdPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8vWt6zW1YtE98S+gIrW7Z3303+if6Iu1Zraa2iYmO+JXSp9XpMOpr7ccreFo71TLxYn3qsY88x7WW6KnWaPLpp52jrU8LR3KZQtWazqVqJiY3AA8egAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJDQ7dfLyvm50p5eMu6UtedQ5taKxuVLptPl1F+rjrz85nuhM6LQ4tPEW+vk/Snw+Cpx46Y6RTHWK1jwhyaGLj1p7z7yp5M029o8ACwiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfJiLRMTETE98Si9btnffTfbSf6JUcZMdbxqXVLzWfZa1omtpraJiY74l8XFrNJi1Nfajq38LR3oTVaXLpr8rx2eFo7pZ2XBbH7/C5jyxf/ALdACBKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOeHHfLeKY6za0+Tv0Wjy6mecezj8bT/AETem0+LT06mOvLznxlYw8eb+8+EOTNFfaPKm0O348HK+TlfJ/KFcDRpSKRqFO1ptO5AHTwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcb0rek0vWLVnviXIBDa7bbY+eTBztTxr4x+KOXUoddt9M/O+PlTJ/KVLNxfmizjz/FkGOeXHfFeaZKzW0eEuCjMaWvIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADlix3y3imOs2tPhB5HFJ6DbZtyyaiOUeFPGfiqtBoKYOV8nK+T+UfBWr+Hja97quTP8AFXysRWIrWIiI7oh9BcVgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHTqtPi1FOrkr8JjvhCa3SZdNb2vapPdaFwvl61vWa2iLVnviUOXBXJ/2kx5Zp/0tYSOv262LnkwRNqeNfGEczb0tSdSu1tFo3AA4dAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKzQaG+omL351xefjPwdVpN51Dy1orG5dWk02XU36tI5RHfae6E5pNNi01OrSOcz32nvl2YsdMVIpjrFax4Q5tLDgjH7/Klkyzf/AKAE6IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAR24bdXLzyYIit/GvhKRHN6VvGpdVtNZ3C1rVtW01tExMd8S+Lg12jx6mvOfZyR3W/FB6jDkwZJpkryn/AJZmXDOOf2XceSLusBCkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB9iJtMRETMz3RCY27b4xcsueIm/hXwj/ukx4rZJ1Di94pHu6du26bcsuojlXvivn8UtEREcojlEPo08eOuONQo3vN53IAkcgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADq1ODHqMfUyRz8p8Ydo8mImNSROveFu63SZNNflbtrPdaPFTroyUpkpNL1i1Z74lCbhob6eZvTnbF5+XxZ+fjzT3r4XMWbt7T5UQCqnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHLHS+S8UpWbWnuiHLBhyZ8kY8decz/JO6LSY9NTs9q8/Wsmw4ZyT+yPJkikfu4bfoaaaOvblbLPj5fBWA061isahRtabTuQB08AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHyYiYmJiJie+JfQENuO3zj55cETNO+a+X/ZHLqRe5bfz55tPHb32pH9FHPxvzUWsWb4siQFJZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHbpdPk1GTqY4+M+EOWj02TU5OrTsiPrWnuhPabBjwY4pjjlHjPjKxgwTk958IcuWKe0eXzSafHpsfUpHbPfM98u4GlEREahSmZmdyAPQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABHbloIy88uGIi/fMfpf90PMTE8pjlMLpUO46GM8Tkx8oyx/wDkqZ+Pv8VfKxiza9rIMfbRNbTW0TEx2TEvjPWwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABUaLS31OTqx2Vj61vJ90OkvqsnKOykfWsnsGKmHHGPHHKsLODBN/efCHLl6+0eXzBhx4McY8ccoj+bsBpRGvaFKZ2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAotx0VdRXr0iK5Y8fP4oO9bUtNbRMTHZMSulR7hoq6mnWryrljunz90qufj9vxV8p8WXr7T4QI5Xral5peJi0dkxLizlwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVOh0t9Vk5R2Uj61nzRaW+pydWOysfWt5J/BiphxxjxxyrCzgwd53PhDly9faPJhx0xY4x468qw5g0ojSkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApNx0ddTTrV5Rljunz90oK9bUvNLxMWjsmJXQo9x0camnWpyjLHdPn7lXkYO34q+U+LL19p8IEfb1tS01tExMdkxL4zlwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAd+j019Tl6leyI+tbycdLgvqMsY6R8Z8oXBpsFNPijHSOyO+fOVjBh9Sdz4Q5cvSNR5fdPhpgxRjxxyiP5uwGnEa9oUpnYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACi3LRRqK+spyjLEf6kHMTEzExMTHfErpUG6aL11Zy4o+kjvj9L/ALqnIwdvxV8rGHLr8MoQJ7J5SM9bAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHZgxXzZYx445zP8nHHS2S8UpEzae6E/oNLXTYuXfefrSmw4ZyT+yPJkikfu56PT002KKV7Z/Onzl3A1IiIjUKEzMzuQB6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI3ddF14nPhj2vzo8/eh11IndtFy56jDHZ33rHh71Lk4Pz1WcOX8sosBRWgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB9iJmYiImZnuiHxM7TovVxGfLHtz9WJ8EmLHOS2ocXvFI3Lt23Rxp6de8c8to7fd7lYDVpWKRqFC1ptO5AHTwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABCbpovU29bij6OZ7Y/RlQLptWtqzW0RMTHKYlAbjpLabL2c5x2+rP9GfyMHX8VfC3hy79pUoCosAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKzbNJOoyda0fR17/AH+51Ws2nUPLWisbl3bTo+vMajLHsx9WPP3ph8iIiIiI5RHdD61ceOMddQoXvN53IAkcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADhnxUzYpx3jnWXMJjftJ4W3q9PfTZpx27Y8J84dK49Zp6anDNLdkx9WfKVv5cd8WScd45Wie1l58Ppz7eF7Fk7x+7gAgSgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOWOlsmSKUjna08og8js0envqc0Y69kd9p8oXDhx0xY646RyrEdjr0WmrpsMUjttPbafOXe1MGH043PlRy5O8+3gATogAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABR7npI1GPr0j6WsdnvjyVg5vWLxqXtbTWdwtaYmJ5THKYfEtvGj589Rij9+P6ollZMc47alfpeLxuABG7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE5tWk9Rj9bkj6S0fdCl2fSde0ajJHsx9WPOfNML3Gw/nlVz5PywALqsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAT2xylBbppPyfJ16R9Haez3T5J1wzY6Zcdsd451tCLNijJXTvHeaStgd2rwX0+acdvsnzh0sqYmJ1K/E7jcADx6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKnb9NOpzdXtikdtpdOLHbLkrjpHO1p5QuHSYK6fBGOvbPfM+crHHxepbc+EWXJ0j28u2tYrWK1jlERyiH0GmogAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKbX6aNTh6vdeO2srftWa2mto5TE8phdKM3jSdas6jHHtR9ePOPNU5OHtHaPKxhyanrKIAZ62AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAr9p0vrsnrbx9HSez3y6pSb21Dm1orG5Vm06T1OP1t4+kvHZ7oV4NelIpXUM+1ptO5AHTwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJ7Y5SAIHdNL+T5utSPo7d3u9yjXNqMNM+G2O/dP8AJbufFfDltjvHbEs3kYuk7jxK7hydo1Pl1gKyYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB26XDbPmrjr498+ULiw464sVcdI5VrHKFNtel/J8HO0fSX7Z93uVjT4+LpXc+ZUs2TtOo8ACwhAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFDuul9fi9ZSPpKR98eSuHN6ReNS9raazuFqiv3fS+qy+upHsXnt90qBkXpNLaloVtFo3AA5dAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACR2fS+syevvHsVn2ffKj02G2fNXFXx758oXFix1xY646RyrWOULXGxdp7T4hBnydY1DmA0VMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwzY65cVsd451tHJbmpw2wZrY798ePnC5lFu2l9fh9ZSPpKd3vjyVuTi713HmE2HJ1nU+EEAzV0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABXbTpvXZ/WWj2Kdvxl1Sk3tqHNrRWNyr9p03qMHXtH0l+2fdHkrQa9KxSNQz7Wm07kAdPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEHu2m9Tm9ZSPYv/KVCubU4a58NsVu6e6fKVuZcdsWS2O8crVnlLN5OLpbceJXcN+0alwAVkwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADljpbJkrSkc7WnlC49LhrgwVxV8O+fOVDsum5VnUXjtnsp8PNJtHi4usdp+VPPfc6gAWkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjd603Wp+UUj2q9lvfCSfJiJiYmOcT3uMlIvXrLqlprO1rCo1+nnT6iafmz21n3KdkWrNZ1LQiYmNwAPHoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA79FgnUaiuOO7vtPlDoT21ab1Gn61o9u/bPujwhNgx+pbXwjy36VVdaxWsVrHKIjlEPoNVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUu5ab8o08xEe3Xtr+C311ITeNP6rP62sexf8AlKly8X54WcF/yyoAFFaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfYiZmIiOcyCr2rT+v1EWtHsU7Z9/lCedGhwRp9PWn509tp97vauDH6df3UMt+1gBMjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHVqsNc+C2K3j3T5S7R5MRMakidTta962peaWjlaJ5TDilN70/K0aisdk9lv6Si2RkpNLaaNLdo2AOHQAAAAAAAAAAAAAAAAAAAAAAAAAAAAkNl0/rM05rR7NO73yoKVm94rWOczPKIXJpcNcGCuKvhHbPnKzxsfa258Qhz36119XaA0lIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABU6Xb9fqu3TaPUZo86Y5mPvexEz4eTaI95UwmsPCu/5e2NvtWP2r1r/AMy7vmdv3+Fx/wAWv4pYwZZ/LP8ACGeThj88fyt8XB8zt+/wuP8Ai1/E+Z2/f4XH/Fr+J93y/pn+Hn3rD+uP5W+Lg+Z2/f4XH/Fr+J8zt+/wuP8Ai1/E+75f0z/B96w/rj+Vvi4Pmdv3+Fx/xa/ifM7fv8Lj/i1/E+75f0z/AAfesP64/lb4uD5nb9/hcf8AFr+J8zt+/wALj/i1/E+75f0z/B96w/rj+Vvi4Pmdv3+Fx/xa/ifM7fv8Lj/i1/E+75f0z/B96w/rj+Vvi4Pmdv3+Fx/xa/ifM7fv8Lj/AItfxPu+X9M/wfesP64/lb4uD5nb9/hcf8Wv4nzO37/C4/4tfxPu+X9M/wAH3rD+uP5W+Lg+Z2/f4XH/ABa/ifM7fv8AC4/4tfxPu+X9M/wfesP64/lb4uD5nb9/hcf8Wv4nzO37/C4/4tfxPu+X9M/wfesP64/lb4uD5nb9/hcf8Wv4nzO37/C4/wCLX8T7vl/TP8H3rD+uP5W+Lg+Z2/f4XH/Fr+J8zt+/wuP+LX8T7vl/TP8AB96w/rj+Vvi4Pmdv3+Fx/wAWv4nzO37/AAuP+LX8T7vl/TP8H3rD+uP5W+Lg+Z2/f4XH/Fr+J8zt+/wuP+LX8T7vl/TP8H3rD+uP5W+Lg+Z2/f4XH/Fr+J8zt+/wuP8Ai1/E+75f0z/B96w/rj+Vvi4Pmdv3+Fx/xa/ifM7fv8Lj/i1/E+75f0z/AAfesP64/lb4uD5nb9/hcf8AFr+J8zt+/wALj/i1/E+75f0z/B96w/rj+Vvi4Pmdv3+Fx/xa/ifM7fv8Lj/i1/E+75f0z/B96w/rj+Vvi4Pmdv3+Fx/xa/ifM7fv8Lj/AItfxPu+X9M/wfesP64/lb4uD5nb9/hcf8Wv4nzO37/C4/4tfxPu+X9M/wAH3rD+uP5W+Lg+Z2/f4XH/ABa/ifM7fv8AC4/4tfxPu+X9M/wfesP64/lb4uD5nb9/hcf8Wv4nzO37/C4/4tfxPu+X9M/wfesP64/lb4uD5nb9/hcf8Wv4nzO37/C4/wCLX8T7vl/TP8H3rD+uP5W+Lg+Z2/f4XH/Fr+J8zt+/wuP+LX8T7vl/TP8AB96w/rj+VvieycIb/Ss2/I625eFctef/ACh9ZpNVo8vqtVp8mG/lesxzc2xXp/tGklM2O/tW0S6QEaQAAAAAAAAAAE/wdwVxZxhqZwcMcPbjutq2it74MMzjxz+1f6tftmGRMfoy9MlsEZJ4Z09Lcufq7blp+t8Pr8v5uZvWvmXUVtPiGHBdvG3Rrx5wXE34m4X3Hb8MT1fyiaRkwc/L1tJmnP7VpPYmJ94czEx5AHoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADnhxZc+amHDjvly3tFaUpWZtaZ7oiI75ZM4c6AOl3fdPXU6Xg3V6bDaOcW12XHpp/0ZLRb+TybRXzL2KzPhjAZW3z0dumDadLbU5eEMuqxVjnP5HqcWe/wilbTafsiWMNfo9Xt+sy6LX6XPpNVht1cuHNjml6T5TWe2J+Lytq28STWY8ugB08AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB2aXBn1Wox6bTYcmfPltFMePHWbWvae6IiO2ZZO4e9Hzpe3vTV1On4O1Olw2jnE63Nj09v9F7RePueWtFfMvYrM+GLRlTfvR66X9n09tRm4O1GqxVjnM6LPi1Fvh1KWm8/ZDGGr02o0epyabV4Munz47dXJiy0mtqz5TE9sSVtW3iSazHl1APXgAAAAAAAAAAAAAAAAAAADhmx1y4rY7xzraOUrbz47Yctsdu+s8lzoze9P1qRqKx217LfBV5WPtXtHwnwX1OkQAzlwAAAAAAAAAAAAAAAAAAAAAAAAAAByx0tkvWlY52tPKASGyafrZJz2jsr2V+KYdenxVw4a4q91Y+92NfFj6ViGfkv2tsASOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI7Z5Qu7hrg3Nqorqd0m2DDPbXFHZe3x/Rj+fwS4sV8s6rCHNnphr2vK2dBotXr88YdHp8ma/lWO74z4fau/aeBLWiL7nqur/wD48PbP22n8F6aLSabRaeMGkwUw44/NrH/Pm7mrh+z6V97+8sTP9qZL+2P2j/8AaN2/Ydo0MR+T6HF1o/PvHXt98pIF6ta1jVY0zbXted2nYA6cgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACn3DRaXX6a2n1eGuXHPhMd3vifCVQPJiJjUvYmYncMUcWbFk2XWRFZtk0uXtxXnv8A3Z9//KFZd4q0Fdx2LU4JrzvWk5MfutHbH4faxEweZgjFf28S+m4HJnPj/F5gAVF4AAAAAAZ+9FboKjpCzzxRxRTLi4Z02XqYsNZmltfkjvrE98Y47ptHbM9kTziZjEXRvwnuPHPG218LbXHLPrs0Utk5c4xY47b5J91axM+/ly75enXCmxbbwxw3t/D+0YIwaHQYK4MNPHlEd8z4zM85mfGZmVbk5ekajymw4+07lUbPtm3bNtuHbdp0Om0OiwV6uLBp8cUpSPdEdirBmrrhqMOHUYMmn1GLHmw5KzS+O9YtW1Z7JiYnsmGn3pW+j7otl23U8d8CaT1Giw88m57bjj2cNfHLijwrH51e6I7Y5RExG4jhnxYtRgyYM+OmXFkrNL0vHOtqzHKYmPGOSTHknHO4cXpF41LyUGSPSM6OcvRr0k6vasWO3yTq+eq2zJM8+eG0z7Ez50nnWfhE+LG7WraLRuFCYmJ1IA9eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACT4U2DdeKOI9Dw/smltqtw12WMWDHHjPfMzPhWIiZmfCImUY3N9BTo2+Ttk1HSLuun5arcK20+2VvHbTBE8r5Pje0co91fKyPLk9Ou3eOne2mUeg3oV4X6MdrxZcWDFuHEF6ctTueWnO3OY7a4on6lPh2z4zPZyygDJtabTuV+IiI1AsTpe6KuE+kzZr6Te9HTFr6UmNLuWGkRn08+Hb+dXzrPZPunlMX2ETNZ3BMRMal5a9JXBm88A8Y63hjfMUV1Omtzpkr9TPjn6uSk+NZj7p5xPbEwttvt6ZfRl88+AvnJten6+97DS2WIpXnbPpu/JT3zXl14+Foj6zQlq4cnqV2o5KdLaAEqMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATXA3C+8cZ8VaHhvYtP6/Xa3J1KRM8q0jvte0+FaxEzM+UIVu76DnRt8gcJZuO9zwRG471TqaOLR24tJE8+f/qWiJ+FaT4yjy5PTrt3jp3tpkroV6HuFejHaMVdBpses3m1OWq3TNSPW5LTHbFP0Kfsx9szPayODJtabTuV+IiI1Ax300dEHCnSftF8W56amk3elOWl3TDjj12KfCLd3Xp+zM+M8uU9rIgVtNZ3BMRMal5W8d8K7xwVxXruGt9wRh12jydW3VnnS9Z7a3rPjW0TExPvQbeb02ujP5z8GU402rT9fdtixz+UVrHbm0nPnb7aTM2j3Tfv7GjLVw5PUrtQyU6W0AJXAAAAAAAAAAAAAAAAAAA43rW9LUtHOLRylyAW1qsU4M98U+E9k+cOpMb3g62KM9Y7adlvgh2Tmx9LzDQx37V2AInYAAAAAAAAAAAAAAAAAAAAAAAAk9jwc721Fo7K9lfj4o6lbXvFKxzm08oXJpsUYcFMUfmx96zxcfa25+EGe+q6+rsAaSmAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOWLHky5a4sVLXveeVa1jnMz5OMds8oZI4H4cjb8NdfrKf9ZePZrP91Wf6z/280/HwWzW1CtyuTXj07T5+DhHhXFt1a6zX1rk1nfWvfXF+M+/7l0g38eKuOvWr5jNmvmt2vIAkRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPlpiKzNuXV5dvNg9ljjLca7dsOe3P6XNE4scePOY7Z+yOcsTsj7SvE2rX6N37IpMUtb6//AMAGY2AAAAAGQPR/6Pc3ST0laDYrVvG24p/Kdyy17Opp6zHWjn4TaZikeU25+EvLWisbl7EbnUNnPQb6NvkHhPNx5umDq7jvVPV6KLR249JE8+f/AKloifhWs+MtknXpcGHS6bFptNiphwYaRjx46RyrSsRyiIjwiIdjIyXm9ptLQrXrGgBw6AAYq9KDo1jpH6Nc+DRYYvvm2dbVbbMRHWvaI9vFz8r1jl+9FJnuec962paa2rNbRPKYmOUxL1taI+ml0Z/NLjmOLNr0/U2ffslr3isezh1ffevui/bePf1/CF3i5fySrZ6fmhr+AvKoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC9OhPgPV9I3SLt3DWDr0017et12asf2Onr23t8Z7Kx+1aHpltmh0m2bdptu0Gnpp9JpcVcODFSOVcdKxEVrHuiIiGE/Q36NvmX0d137ctP1N63+tc94tHtYdPy54sfumYnrz+9ET9VnRmcnJ3tqPELuGnWuwBXTAAExExynth53+lX0af+HfSPlvt+D1ew7vNtVt/Vj2cU8/pMP8Almez9m1fe9EFgdP3R5p+kro412xdXHXccUflG25rdnq9RWJ5RM+FbRzrPutz74hNgyenb9keWnerzQHbrNNqNFrM2j1eG+DUYMlsWXHeOVqXrPKazHhMTEw6mqoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMg+j90e5uknpL0GxzW0bdhn8q3LJH5unpMdaOfhNpmKx5Tbn4S9KdLgw6XTYtNpsVMODDSMePHSOVaViOUREeERDEPomdG3/h/0a4tTuGn9Xvm9dXVa3rRytipy+ixT+7WZmY8LWtHhDMTL5GTvb28QvYadagCBKAA45cePLiviy0rkx3rNbVtHOLRPfEx4w84/SX6NsnRt0k6nRabFaNl3Dnqtsv4Rjmfaxc/Ok9nny6s+L0eYy9JLo3x9JPRtqtv0+Kk7zoeeq2y8x2+siO3Hz8rx7Plz6s+Cfj5Olvfwiy07Vebw5ZseTDlvhzY748lLTW9LRymsx2TEx4S4tRRAAAAAAAAAAAAAAAAAAAAfL1i9JraOcTHKYW3qsU4M98U+E9k+cLlRu94OtirnrHbXst8FblY+1dx8JsF9W19UOAzV0AAAAAAAAAAAAAAAAAAAAAAB9iJmYiI5zPZAJHZMHWy2z2jsp2V+KYdWkwxg09Mcd8R2++Xa1sNOlIhn5LdrbAErgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABU7Zo824a/Do8Ee3lty5+UeMz8I7XsRMzqHkzFY3K5ejzZI1ep+U9TTnhw25Yon86/n8I/5+DIbo2/S4tDosOkwRyx4qxWPf7/jPe730XHwxhpFXynK5E58k2+PgATqwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC3ePd3+TtpnT4b8tRqedK8u+tfzp/p9vucZMkY6zafhJixTlvFK/KzeNt3+VN3tGO3PTYOdMXLunzt9v/EQggfN5Lze02n5fW48cY6RSviABwkAAAAHoV6JXRt8wOjXFq9wwer3ze+rqtZ1o9rFTlPqsX+WszM/tXtHhDV/0Qujb599JOPctxwdfZNimmq1PWj2cuXn9Fi9/OYm0+HKkxPfD0EUuXk/JCzx6fmkAUVoAAAAWt0rcF7f0gcB7nwvuHVrGqx88Gaa85wZq9uPJHwnv84mY8V0j2JmJ3DyY37PKDiLZ9w4f33XbJu2ntptdoc9sGfHb821Z5T8Y8YnumOUqBt16dvRn18eDpL2jTe1XqabeIpXvjsrizT/ACpM/uNRWtiyReu2fevWdACRyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMt+it0bT0idJeD8v085Ni2nq6vcJmPZycp+jwz+/aO2P0a2YnwYsufNTBgx3y5clopSlKzNrWmeURER3zL0j9HPo6xdG3Rpo9qzY6xu2q5arc7xymZzWiPY5+VI5Vj4TPig5GTpX28ylw07WZIiIiOUdkAMteAAAAAAaW+nN0ZTtHEGLpD2jTzGh3O8YtyrSOzFqeXs5PdF4jt/arPPttDWN6q8b8N7ZxfwnuXDW8YoyaLX4JxX7O2s99bx+1W0RaPfEPMbj7hfcuC+Mdz4Y3anLV6DPOObRExGSvfW9ef5tqzFo90tHi5e1es+YU89NTuEGAtIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABmv0Qejb59dJFNz3HT9fZNimup1HWj2cuXn9Fi9/OYm0+6vLxhhrQ6XU67W4NFo8N8+p1GSuLDipHO172nlWsR4zMzEPS7oJ4A03Rv0b7fw7SMdtbMev3DNSP7XUXiOtPPxiOUVifKsK/IydK6jzKXDTtZfQDMXgAAAAAGjvpudGXzb4vpxxtWn6u173kmNVFa+zh1fLnM/wDqRE2+MX9zXN6m9I/CW28c8Fbnwvutf+n12Ga1yRHO2HJHbTJX31tET7+XLul5j8XbBuXC3E248O7vh9Trtvz2w5q+EzHdaPOsxymJ8YmJaXGy9q6nzClnp1ncIoBZQgAAAAAAAAAAAAAAAAADjetb0tS0c4tHKXIBbOoxWw5r4rd9Z+91pbfMHOK6isd3s2/oiWRlp0vMNDHbtXYAjdgAAAAAAAAAAAAAAAAAAACv2bB6zU+smPZx9v2+CgXDt2D1GlrWY9qfat8VjjU7X39EOa3WqpAaakAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMg9G+0eo0lt0zV+kzR1cUTHdTxn7Z/lHvWhw3tl923bFpI5xj+tltHhWO/8AD7WXcVKYsdceOsVpSIrWsd0RHdDS+z8Ha3qT8Mj7U5HWvpR5ny5ANhggAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOOXJTFivlyWitKVm1rT3REd8sQ8R7nfdt2y6u3OKc+rirP5tI7vx+1d/SRu/qdLXasF/pM0dbNy8KeEfbP/AB72P2P9oZ+1vTj4b32Xx+tfVnzPj/oAZrXAAAAHdotLqNbrMGj0mG+bUZ8lcWLHSOdr3tPKKxHnMzEOlsx6DHRt8tcT5+kDdMHPQ7RecOgi0dmTVTHbb4UrP+q9Zjtq4yXilZtLqle06bNdA3AGn6N+jbb+H61pOutH5RuOWv8Aeai8R1u3xisRFI91YlfgMi0zady0IjUagAePQAAAAAFFvu16HfNl1uz7np66jRa3BfBnxW7rUtHKY/n3vMvpe4H1/R5x/uXDGt696YL9fS5rRy9fgt247/bHZPlMTHg9QWBvTN6NI4x4B+cu2afr71sNLZeVY9rPpu/JTs75r9ePhaI+sscbJ0tqfEoc1O0baFANNSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAV/Dmz7hxBv2h2PadPbUa7XZ64MGOPG1p5Rz8o8ZnwjnIM9ehH0a/OXjW/Gm6aabbVsV4/JutHs5tZy51+PUj2/jNPe3lWx0W8G7fwDwJtnC+3RFqaTF9Nl5cpzZZ7b5J+NufwjlHgudk5snqW2v46dK6AESQAAAAAAa1+nF0ZfL3DGPj7adPNtx2fH6vXVpHbl0nOZ63xxzMz+7a3Puhso69Tgw6nTZdNqMVM2HLSaZMd6xNb1mOUxMT3xMO8d5pbcOb1i0aeSoyN6RHRzm6NeknWbRjpedq1PPVbZlnt62G0z7Ez42pPOs/CJ8YY5a9bRaNwz5iYnUgD14AAAAAAAAAAAAAAAAAAAAAAAAAAAl+DOHdy4s4q23hvZ8XrdduGeuHFE8+Veffa3LurWIm0z4REkzo8tg/QX6NvljiTP0g7pgi2h2q84dvrevZk1Mx23+FKz/AKrRMdtW6iD4B4X23gvg7bOGNpp1dJoMEY4tMRE5Ld9r25fnWtM2n3ynGTlyepbbQx06V0AInYAAAAAA1b9Onoy+UNpw9I+0aebarQ1rg3WtK9t8HPlTL8aTPVn9m0d0VbSKfctFpNy27U7dr9Pj1Gk1WK2HPhvHOuSlomLVmPKYmYd47zS24c3r2jTyZF89OfAGq6N+kbX8O5evfR8/X7fmtH9rp7TPVn3zHKaz76ysZrxMTG4Z8xqdSAPXgAAAAAAAAAAAAAAAAADhmx1y4rY7d1o5LayUtjyWpbvrPKV0IffMHVy1zxHZbsn4qnLx7r2+ifBfU6RoDPXAAAAAAAAAAAAAAAAAAAAFVtmH12rrEx7NfalcCh2bD6vTesmPaydv2eCuanGp1p/2o5rdrACdEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAnuCNo+VN3rbLXnptPyvk5x2Wnwr9v/ABEu8dJvaKx8o8uSMdJvbxC8eA9o+TtpjPlry1Gp5XtzjtrX82P6/auIH0mPHGOsVj4fJZck5bze3yAO0YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6Nx1eHQ6HNq888seKvWn3+Ufa71gdJO7+t1FNpwX9jFyvm5eNvCPsj/n3IORmjFSbLHFwTnyRX4+Vq7lrM2v1+bWZ555MtutPu8o+yOxTg+dmZmdy+siIiNQAPHoAAACV4P4f3LirifbuHdoxet124Z64cUeETPfafKIjnMz4REvTvo+4W23grgza+F9qry0ugwRji8xynJfvvkn32tNrT8WunoI9G35Htmp6SN1wcs+ri2l2qLR9XFE8smWP3rR1Y8eVbeFm1LO5WTtbrHwuYKajcgCqnAAAAAAAACYiY5T2wAPOz0qOjT/w66Sc35Bgmmxbt1tVt8x9XH2/SYf8AJM9n7Nq+PNiR6V+kJ0d4ekro21uy1rSu54P+p23Lb83PWJ5V5+Vomaz8efhDzY1enz6TVZdLqsN8OfDe2PLjvXlalonlMTHhMTHJqcfL3r7+YUc1OtnWAnRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADbb0EOjXt1PSXu2mns6+l2iLx9mXNH86RP/me5rf0XcHbhx7x3tnC+3VtF9Xlj12WI5xhxR23yT8KxPxnlHi9OOG9m2/h7YNDse1YIwaHQ4K4MFI8K1jlHPzme+Z8ZmVXlZOtesfKfBTc9pSADOXAAAAAAAAAAGKPSh6Na9I/RtnxaLBFt82vrarbZiPavMR7eH/PEcv3orPg86b1tS01tWa2ieUxMcpiXra0R9NLoz+aXHMcWbXp+ps+/ZLXvFY9nDq++9fdF+28e/r+ELvFy/klWz0/NDX8BeVQAAAAAAAAAAAAAAAAAAAAAAAAABuR6CfRr+Q7VqekfddPy1GtrbTbXW9e2mGJ5ZMsc/G0x1Ynyrbws1p6GOBdZ0i9Im28M6b1lMGW/rdbnpHP1Gnr23v8e6sc/wA61Y8XpntWg0e1bZpds2/BTT6TSYa4cGKkcopSsRFYj4RCpysmo6x8rGCm57SqQGetgAAAAAAAAAMM+lt0Z/8AiB0c31u3af1m+7LFtTo4rHtZsfL6TD7+cRExH6VYjxl57vW5oD6YPRl8xukK29bZp+psW+2tnwxSvKuDP35MXujnPWr3dluUfVXeJl/JKtnp+aGDwF5VAAAAAAAAAAAAAAAAAAHTrMMZ9NfH4zHZ8XcPJiJjUkTqdrWmOU8p73xWbvh9Vq5tEezk9qPj4qNj3rNbTEtKtu0bAHL0AAAAAAAAAAAAAAAAdmmxTmz0xR+dPb8HWldiw9t88x+zX+qTFTveIcZLda7SlYitYrEcoiOUPoNdngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPtK2vaK1ibWmeURHfMsucLbVXaNox6eYj11vbzTHjafD7O5Z3RztH5Vr53LNXnh008qc4+tf/ALd/x5Mitf7Pwaj1J+fDC+1OR2t6VfjyANNjgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI/iHcqbTtWXV25TeI6uOs/nWnuj/55MQZsmTNmvmy2m+S9pta098zPfK4uPt3+UN1/JcN+en0szWOXda/50/0+z3rbYXNz+pfUeIfS/Z3H9LH2nzIApNAAAAAXh0OcDazpE6Qtt4Y0k2x4s1/WavNEc/U4K9t7/Hl2R52mI8Vnt9PQv6Nvmh0fRxNuWCK7xxBSuaOtHtYdL346fG3Prz8axP1UWbJ6dd/KTFTvbTOG0bfo9p2rSbXt2npp9Ho8NMGDFTupSsRFax8IiFUDJXwAAAAAAAAAAABpN6cnRp8h8T4uP9qwdXb94yer19ax2YtVEc4t8MlYmf3q2mfrQ3ZQfH3C+28acHbnwxu1OtpNfgnHNoiJnHbvrevP86toi0e+EuLJ6dtuMlO9dPK0THG3De5cI8Wblw3u+L1es0Ge2K/laO+t4/ZtExaPdMIdrRO2f4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZH9HTo6y9JPSVo9pzY7/JOl/wCq3PJHOOWGsx7HPzvPKsfGZ8HlrRWNy9iNzqGz3oRdGvza4Kyca7pp+ruu+0j8mi9faw6SJ51+HrJ5X99Yp72xLhgxYsGGmHDjpixY6xWlKViK1rEcoiIjuiHNkXvN7TaWhWvWNADh0AAAAAAAAAALX6VODNv4/wCBNz4X3GIrXVYvoM3LnODNHbjyR8LcufnHOPFdA9iZidw8mN+zyh4k2bcOHt/12x7rgnBrtDntgz0nwtWeXZ5xPfE+MTCPbfenZ0ZTn0+DpL2jTzOTFFdNvFaR307sWafh2UmfKaeUtQWtiyReu1C9OttACRwAAAAAAAAAAAAAAAAAAAAAAAyx6LXRvPSL0mafHrcE32Taurq9xmY9m8RPsYv89o/0xbyeWtFY3L2sTadQ2f8AQz6Nvmb0e/OLcsE03nf61zWi9eVsOmjtx084mefXn41ifqs7lYitYrWIiIjlER4DHvab2mZaFaxWNQAOXQAAAAAAAAAAs3pn4E0XSN0e7jwzqupjz5K+t0We0c/Uaiv1L/Dwn9m0wvIexMxO4eTG41Lyb3jbtbtG66vaty099NrdJmtgz4rxytS9Z5WifthStrvTr6MvyfVYekvaNP8ARZ5rpt3rSvZW/ZXFmn49lJnzinjMtUWvjvF67hn3r1nQA7cgAAAAAAAAAAAAAAAAAKPd8PrdJNoj2qe1Hw8UCumY5xynuW5rMXqNTfH4RPZ8FHl094stce3t1dICksgAAAAAAAAAAAAAAAPsRMzyjtmVyaTFGDT0x+MR2/HxQ204fW6yszHs09qf6J5f4lPabKvIt79QBcVgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB26PT5dXqsWmwV62TLaK1j3y6l9dGu0cq33fNXtnnTBzjw/Ot/T702DFOW8VV+TnjBjm8rs2fQ4tt27Do8P1cdeUzy+tPjP2yqwfRxEVjUPk7Wm0zMgD14AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAITjTd/kraLTjty1OfnTF5x52+z/AJ5Ju0xWs2tMRERzmZ8GJOLN1nd93yZqzPqKexhj9mPH7e9U5mf0sft5le4HH9bL7+IRIDAfTgAAAAPtK2vetKVm1rTyrWI5zM+QMp+jB0bz0jdJmm0+sw9fZds6ur3KZj2b0ifZxf57dn7sWnwejVYitYrWIiIjlER4MY+jV0c16N+jPSbfqcVY3jXctXuVojtjJaOzHz8qV5V8ufWnxZOZefJ3t7eF7FTrUAQJQAAAAAAAAAAAAAGsPp0dGfyrsOHpE2nTxOs2ykYdyrSO3Jp5n2cnvmlp5T+zbyq0vetGu0um12iz6LWYaZ9NqMdsWbFeOdb0tHK1ZjxiYmYeanTz0fano26RtfsFoyW0F5/KNuzWj+009pnq9vjNe2s++sz4tDi5Nx0lUz01PaFhALauAAAAAAAAAAAAAAAAAAAAAAAAAAAAREzPKI5y9EvRV6No6POjTBOv0/q983fq6vcOtHK2PnH0eGf3Kz2x+la7V/0OejX569Ild83LT9fZdhtTUZItX2c2o588WPt7JiJjrTHlERP1m/ijy8n5IWuPT80gCksgAAAAAAAAAAAAAKTedt0O8bTq9p3PTU1Oi1mG2DPhvHZelo5TE/ZLzN6ZeBdb0ddIW48Mavr5MWK3rdHntHL1+ntzml/jy5xPLutW0eD09YO9MToy+fHR9bfNs0833zYaXz4orHtZ8Hflx++YiOtX3xMR9ZY42XpbU+JQ5qdq7aBANNSAAAAAAAAAAAAAAAAAAAAAAcsWPJly0xYqWyZL2ita1jnNpnuiI8ZekPo3dHNOjfoz0e26jFWN31nLV7neO2fW2jsx8/Kkcq+XOLT4tYvQl6NvnPxxfjLcsE22rYclZwdaPZy6vlzpH+SOV5980829Cjy8m56QtYKfmkAUlkAAAAAAAAAAAAABHcTbLt3EfD+v2LdsEajQ6/BbBnxz41tHLsnwmO+J8JiJeZHSlwbuPAPHW58L7lztfSZfosvLlGbFPbTJHxry+E848HqQ1+9NToz+dnA9eLtq0833jYcdrZK0rztn0nPnevvmnbePd1/GVnjZeltT4lDmp2jcNEgGkpAAAAAAAAAAAAAAAAAACL33DzimeI7vZt/RKOrVYozae+Kfzo7Pijy070mHeO3W0StofZiYmYmOUx3vjIaAAAAAAAAAAAAAAADnhpOXLXHXvtPIiNiY2XD6vS+smO3JPP7PBXuNKxSlaV7IrHKHJs0r0rEM61u0zIA6cgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK3ZNvy7pueHRYuzrz7Vv0ax3yzBpcGLTafHp8NYrjx1itYjwiFtdHm0fkW2zr81eWfUxzrzjtrTw+/v+5dLc4OD06dp8y+b+0uR6uTrHiABeZwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADr1WfFpdNk1Ge0Ux46za0+UQ8mdPYjftC2ekTd/yPbo2/Dflm1Me1y764/H7+772OFZvW4Zdz3PNrcvZN7ezX9GvhH3KN89yc3rZJn4fVcTj+hiivz8gCutAAAADYH0KOjb51ceTxbuWCLbTsF63xxaOcZtXPbjj/ACfXn39TzYK2Pa9dve86LZ9swW1Gt1uemDBjr32vaYiI++Xpv0ScFaHo+4A2zhfRdS86bHz1OascvX57duS/2z3eUREeCvycnSuo8ymw07W2usBmLoAAAAAAAAAAAAAAAAw56WXRn/4g9HOTVbdp4vv2zRbU6Lq153zU5fSYY8+tERMR+lWsdnOWYx1W01ncPLVi0al5IjOPph9GfzI6Q7b3tmm9Xse+2tnxRWPZw5+/Lj90c560e60xH1WDmvS0XruGdas1nUgDp4AAAAAAAAAAAAAAAAAAAAAAAAKjbdFq9y3HTbdoNPk1Gr1WWuHBhxxztkvaYitYjzmZiFO2g9BXo1+Ut8z9Iu66fnpNutbBtlbx2XzzHt5OU+FKzyif0redXGS8UrNpdUr2nTZnoR4C0nRx0dbdw3g9XfVVr67X5qx/bai3Lr25+MR2Vj9mtV6gyJmZnctCI1GoAHj0AAAAAAAAAAAAAAAB56+ln0Z/+H/SNk1e26f1ew7zNtToorXlXDfn9Jh/yzPOI/RtEeEsNvTTp26P9L0k9HOv4eyRjprYj1+35rR/ZaisT1Z5+ETzms+60vNLcNHqtv1+o0GuwZNPqtNltizYskcrUvWeVqzHnExMNTj5e9dT5hRzU62dACdEAAAAAAAAAAAAAAAAAAK7h/adfv2+aLZdr09tRrtdnpgwY4/OvaeUfCPf4KFtp6CHRt1smp6S91wezXr6TaItHj9XLmj+dI+N/c4yXilduqV7W02S6KuDNBwBwFtfC2gmL10mL6bNy5TmzW7cmSfjaZ5R4RyjwXQDImZmdy0IjXsAPHoAAAAAAAAAAAAAA+XrW9LUvWLVtHK1ZjnEx5PoDzm9KDo1t0cdJOfDo8PV2Pc+tqttmI9mlZn28PxpM8v3ZrPixU9J/SK6OcXSV0bazacVKfK2l56rbMk8o5ZqxPsTPhW8c6z8Ynwebeow5tPqMmn1GK+LNivNMlLxytW0TymJjwmJanHyd6+/mFHNTrZwATogAAAAAAAAAAAAAAAAAEDu+H1Wsm0R7N/aj+qjTm9YfWaX1kd+Oef2INl8inW8r2K3aoAgSgAAAAAAAAAAACQ2PF1tRbLMdlI7PjKPT+04vVaOvOO2/tT/AEWONTtf/pFmtqqrAaaiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJfhLaZ3beMeK0fQY/bzT+zHh9vd96IjtnlDK3Bm0/JWz1jJXlqM3LJl848q/ZH8+a1xMHq5PfxClzuR6GL28z4TdYisRWsRER2REeAD6B8uAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALH6St37KbRgv38r5+X/AONf6/cu3edfi2zbc2tzd2OvZH6VvCPvYe1eoy6vVZdTnt1smW02tPvln8/P0r0jzLU+zOP3v6k+I/t1AMV9CAAAAAuHo34S3Hjnjfa+Ftsjln12aKWyTHOMWOO2+SfdWsTPv5ciZ1G5IjbY70EOjb12q1PSVumCJx4evpNpi0d95jllyx8InqR8b+Tb9G8LbHt3DXDm37BtOGMOh0GCuDDTx5RHfPnM98z4zMpJkZcne22hSnWugBG7AAAAAAAAAAAAAAAAAAWZ00cCaPpG6PNx4a1Pq6Z8lPW6LPaP7DUV7aW+HhPL820w8zt32/WbTuur2vcdPfT6zR5r4M+K/fS9ZmLVn4TEvWRp76dnRn+S67B0lbTp+WHUzXTbvWv5uTlyxZeX7UR1J98V8bSt8XLqes/KvnpuO0NUwGgqAAAAAAAAAAAAAAAAAAAAAAAAJrgbhrc+MeLtt4Z2jH19ZuGeMVJn6tI77Xt+zWsTafdEvTvgfhvbOD+Ett4a2jF6vR7fgjFTs7bz32vb9q1pm0++Za8+gt0a/JmxajpE3bTRGr3Gs4Nsi8duPTxPt5I8pvaOUT+jXys2fZ3KydrdY+FzBTrG5AFVOAAAAAAAAAAAAAAAAAANM/To6Mvk7eMPSNtGn5aTX2rg3StI7Mefl7GX3ReI5TP6VY8bNzETxhw/tvFfC+48O7vh9bodfgthy18Y591o8rRPKYnwmISYsnp224yU7108pxcHSLwnuXA/Gu58L7rX/qNDmmkXiOVctJ7aZK+61ZiftW+14ncbhnzGgAAAAAAAAAAAAAAAAAFy9GPB+48ecc7ZwttkTXLrMsRky9XnGHFHbfJPurWJnl4zyjvl6c8NbNt/DvD+g2LacEYNDoMFMGCnfyrWOUc58ZnvmfGZmWBPQh6Nfm5wbk423TTzTdN8pEaWLR24tJE84/1zEW+EU97Ytm8nJ2tqPELuGnWNyAKyYAAAAAAAAAAAAAAAAAAaR+nB0ZfIHFWPj3adP1dt3nJ1NdWlezFq+Uz1vhkiJn96LT4w3cQXSBwttnGvBu58MbtTnpdfhnHNuXOcV++mSv7VbRFo+CXDk9O23GSneunlcJjjXhzc+EeKtx4b3fF6vW6DPbDk7Oy3LutXzraOVonymEO1onbP8AAAAAAAAAAAAAAAAAAON6xelqW7rRylbWWk48tsdu+s8lzoXe8XU1MZY7rx/OP/AJCpy6br2+ixx7anSPAZ62AAAAAAAAAAAA7NNjnNnpij86eX2LliIiIiI5RCH2LF1s98sx2VjlHxlMtHiU1Tf1U+RbdtAC0gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAc8GLJmzUw4qzfJe0VrWPGZHnhcXAG0fl+6/leavPT6WYtPOOy1/CP6/d5smKDh/bce1bVh0dOU2rHPJaPzrT3z/8APCIV76Hi4fSx6+Xy3M5Hr5Zn4jwALKoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiuKt1jaNoyZ6zHr7+xhj9qfH7O9ze0UrNp+HdKTe0Vr5lZ3SLu/5XuEbdhvzw6afb5fnZP8At3fetR9ta1rTa0zNpnnMz4y+Pm8uScl5tL63BijDSKR8ACNKAAAAN3fQc6NvkDhLNx3ueCI3HeqdTRxaO3FpInnz/wDUtET8K0nxlrH6P3R7m6SekvQbHNbRt2Gfyrcskfm6ekx1o5+E2mYrHlNufhL0p0uDDpdNi02mxUw4MNIx48dI5VpWI5RER4REKfKyajpCxgpue0uwBQWwAAAAAAAAAAAAAAAAAAABG8U7Ht3EvDuv2Dd8Hr9Dr8FsGanj1ZjvifCY74nwmIlJB4Hlr0m8H7jwHxxufC+5xM5dHlmMeXq8ozYp7aZI91qzE+6eceC2283ptdGfzn4LpxptWn6+7bFjn8oise1m0nPnb7aTM3j3Tf3NGWthyepXbPyU6W0AJXAAAAAAAAAAAAAAAAAAAAAvboQ4C1fSP0jbdw3hi9dLa3rtfmr/AHOnrMde3xnnFY/atCyW/noddGvzJ6O673uWmim979WufL1o9rDp+XPFj90zE9aY87RE/VRZ8np138pMVO1matt0Wk23btNt2g0+PT6TS4q4cGGkcq46ViIrWI8oiIhUAyV8AAAAAAAAAAAAAAAAAAAAABrl6bvRl84+Eacc7Tp5vumyY5rq60rznNpOczMz/wCXMzb92b+UNHnrXnxYs+G+HNjplxZKzW9L1ia2rMcpiYnviXm/6SHRxk6NeknV7bgx2+R9bz1W2XnnMeqtPbj5z40nnXz5dWfFf4uXcdJVc9NfihjQBcVgAAAAAAAAAAAAABkb0dujvL0k9JWi2fLS/wAlab/qtzyRzjlgrMexE+E3mYrHj2zPhLHMRMzyiOcvRH0U+jaOj3o0w212Dqb5vHV1ev5x7WOOX0eGf3azPOP0rWQ58np1/dJip2sy1gxYtPgx4MGOmLFjrFKUpHKtaxHKIiPCOTmDKXwAAAAAAAAAAAAAAAAAAAAAGsPpzdGXyrsOLpE2jT89bttYw7lWle3Jp+fs5PjSZ5T+zbnPZVpe9aNdpdNrtFn0Wsw0z6bUY7Ys2K8c63paOVqzHjExMw81enzo91HRt0j67YZre235J/KNuzW7fWae0z1e3xmsxNZ99efdMNDi5dx0lUz01PaFggLauAAAAAAAAAAAAAAAAKPd8XrNHaYjtpPWj+qsfLRFqzWY5xMcpc3r2rMPaz1na1hzz45xZr4576zycGNMa9mkAAAAAAAAAAA54Mc5c1McfnTEPYjc6E5tOL1eipzjtv7Uqt8rEViIjujsh9bFK9axDNtO52AOngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvPo22j1ue+7Zq+xj50wxMd9vGfs7vt9y1ds0ebcNfh0eCPby25c/KPGZ+EdrMO36XFodFh0mCOWPFWKx7/f8Z71/gYO9+8+I/tl/afI9Onpx5n+neA23zwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxXxtu/ypu9ox256bBzpi5d0+dvt/4iF5ce7v8nbTOnw35ajU86V5d9a/nT/T7fcxgyftDP8A8cf+tv7K4/8Ay2/8AGW2gAAAAGavRB6Nvn10k03PcMEX2TYppqdTFo51zZec+qxfbMTafdWY8Yc3tFY3L2tZtOobQ+iV0bfMDo0xarX4Ipvm99XV6znHK2KnL6LFP7sTMz5WvaPBmMGRa02nctGsRWNQAOXoAAAAAAAAAAAAAAAAAAAAADjlx48uK+LLSuTHes1tW0c4tE98THjDzi9JXo2ydG3STqdDpsV42XX89VtmSY7PVzPtY+fnSfZ8+XVnxej7GHpL9G2PpJ6NtTotNirO9aDnqtsvy7ZyRHtYufleOzy59WZ7k/HydLe/iUWWnarzgHLJS+PJbHkpal6zNbVtHKYmO+JhxaiiAAAAAAAAAAAAAAAAAAA54MOXUZ8eDBjvly5LRSlKRzta0zyiIjxnmDLPoqdG09IfSXhtr9P6zYto6ur3DrR7OTt+jwz+/aO2P0a29z0SiIiOUdkMc+jr0d4ujbo00W0ZcdPlXU/9VueSO3nmtEexz8qRyrHwmfGWRmVnyd7fsvYqdagCFKAAAAAAAAAAAAAAAAAAAAAAMXekz0bU6SejbU6TS4otve3dbVbZbum2SI9rF8LxHLy59WfBlEdVtNZ3DyYiY1LyTyUvjyWx5KWpeszW1bRymJjviYcWwfps9G8cLcd04u2zTxTat/ta2WKRyjFq47bx7uvHtx5z1/Jr416Xi9YtDPtWazqQB05AAAAAAAAAAAVG26LV7luOm27QafJqNXqstcODDjjnbJe0xFaxHnMzEAzT6HXRrPG3SLXe9y0/X2TYbV1GXrV9nNn78WP38pjrT7qxE/Whv6snoQ4C0nRx0c7dw3hiltVWvrtfmr/fai0R17fCOUVj9msL2ZWfJ6lt/C/ip0qAIUgAAAAAAAAAAAAAAAAAAAAAAxB6VvRn/wCIfRxky7fp/Wb9s/W1Wg6tedsscvpMP+aIiYj9KtWXx1W01ncPLRFo1LyRmJieUxykZz9Mno3rwV0jTve2aeMezb/N9RjrSOVcOoiY9bT3RMzF4/emI+qwY16Wi9YmGdas1nUgDp4AAAAAAAAAAAAAAAAhd8xdXUxkiOy8fzj/AOQj07vOL1mjm0R20nn9iCZfJr1yT+69htugAgSgAAAAAAACv2TH19VOSe6kfzn/AOSoE5suPqaTrzHbeef2J+PXtkj9kWa2qK4BqKIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACS4b2y+7bti0kc4x/Wy2jwrHf8Ah9rqtZtMVhze8UrNp8Qu/o32j1Gktumav0maOriiY7qeM/bP8o968HHFSmLHXHjrFaUiK1rHdER3Q5Po8OKMVIrD5LPmnNkm8gCVCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOOXJTFivlyWitKVm1rT3REd8uSzukjd/U6Wu1YL/SZo62bl4U8I+2f+PeizZYxUm0puPhnNkikLQ4j3O+7btl1ducU59XFWfzaR3fj9qOB85a02mZl9bSsUrFY8QAOXQAAADu0Wl1Gt1mDR6TDfNqM+SuLFjpHO172nlFYjzmZiHpb0D8Aafo36Ntv4erGO2umPyjcctf7zUXiOt2+MViIpE+VYayegx0bfLPEufpA3TBFtDtN5w6Cto7MmqmO2/wAKVn77RMfVbrKHKybnpC3gpqO0gCmsAAAAAAAAAAAAAAAAAAAAAAAAAANGPTa6M/mxxpTjPatPNdp33JM6iKx7OHV99o90XjnaPfF/c14epPSdwft3HnA258LbnEVxazFMY8vV5zhyx20yR762iJ5eMc47peZHFGybjw1xFr9g3bBODXaDPbBmp4das8ucecT3xPjExLS42TvXU+YUs1Os7hGgLKEAAAAAAAAAAAAAAAAbF+hD0bfOTjPJxtumn6217FeI00Wj2curmOdf4cTFvjNPewJw3s24cQ7/AKHY9qwTn12uz1wYKR42tPLt8ojvmfCIl6c9F/B+38BcC7XwttsRbHo8XLLl5cpzZZ7b5J+NpmfdHKPBW5OTrXUeZTYadp3K5QGaugAAAAAAAAAAAAAAAAAAAAAAAAALD6feCacf9FW87BXFF9b6r8p0EzHbGox87UiPLrdtJnytLzNtE1tNbRMTE8pifB63PNv0nOF6cJdNvEO34McY9JqM/wCW6aIjlEUzR15iI8otNq/5V3h381VuRXxZjUBeVQAAAAAAAAABtB6C3Rr8p75n6RN10/PSbdacG2VvHZk1Ex7eT3xSs8on9K3nVrzwNw1uXGHFu28M7Rj6+s3DPXFSZiZikd9r25fm1rE2n3RL064G4a23g/hLbOGdox9TR7fgripMxETee+17cvzrWmbT75lV5WTrXrHynwU3O5TQDOXAAAAAAAAAAAAAAAAAAAAAAAAAAGNPSY4Jjjvoh3fbcOH1m4aOn5doOUc7euxxM9WPfas2p/mebj1ueZXT5wtHBvS/xHsOLH6vTY9XObS1jujDliMlIj4RaK/ZK9w7+aqvIr4lYwC6rAAAAAAAAAAAAAAAAOOSsXx2pbutHKVs3rNL2pbvrPKV0IHeMfq9baY7rx1lTl13WLLHHt7zCjAZ62AAAAAAAA+xEzMRHfPYubDSMeKmOPzYiEFteP1mtxx4VnrT9i4F/h19psq8i3vEAC4rAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADJ/Ae0fJ20xny15ajU8r25x21r+bH9ftWdwRtHypu9bZa89Np+V8nOOy0+Fft/4iWU2r9n4P8Akn/xi/avI/4q/wDoA1WIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6Nx1eHQ6HNq888seKvWn3+Ufaw7uWsza/X5tZnnnky260+7yj7I7F1dJO7+t1FNpwX9jFyvm5eNvCPsj/n3LNYnPz979I8Q+i+zOP6eP1J8z/QAoNMAAAAS3B3D25cV8U7dw5tGL1uu3DPXDiie6OffafKsRzmZ8IiUS3H9BLo2/Itr1HSPuun5ajWRbTbXF47a4onlkyx+9MdWPdW3hZHlyenXbvHTtbTYro/4W23grg3bOGNpry0ugwRji0xynJbvveffa0zaffKdBkzO53LQiNADwAAAAAAAAAAAAAAAAAAAAAAAAAAGqfp2dGn5TosHSVtODnl08V027VrHbbHz5Y8v2TPUn3TXwiW1il3jbtFu+1avaty09NTotXhtgz4bxzrelo5Wifsl3jvNLbhzevaNPJsXl0z8Cazo56Q9x4Z1U3yYcVvW6LPaOXr9Pbn1L/Hvif2q2jwWa14mJjcM6Y1OpAHoAAAAAAAAAAAAAufos4N3Dj7jvbOF9v51tq8seuyxHOMOGO2+SfhXn8Z5R4kzERuSI37NkfQQ6NuVdT0l7rp+2evpNoi8eHdlzR/OkT+/wC5tsoOHdo2/h/YdDsm1YIwaHQ4KYMGOPCtY5Rz85858Z7VeyMt5vbbQpXrXQAjdgAAAAAAAAAAAAAAAAAAAAAAAAADTr/6heyRi37hXiOlO3UabNostvL1dovT7/W3+5uK109P3QVz9Eu06+Ij1ml3rHXnP6N8WWJ/nFU3HnWSEeaN0lo4A1VAAAAAAAAABe3QhwFq+kfpG27hvDF66W1vXa/NX+509Zjr2+M84rH7VoeTMRG5exG51DZj0FujX5M2PP0ibrp+Wr3Gs4NtreO2mnifbye6b2jlE/o18rNoFPtui0m27dptu0Gnx6fSaXFXDgw0jlXHSsRFaxHlEREKhkZLze0zLQpXrGgBw6AAAAAAAAAAAAAAAAAAAAAAAAAAGlP/ANQTZK6Xj7h/f6V6sbjt19PflH1r4b8+fx5Zax9kN1msn/1CNBGTgPhrdOr26fdL6eJ5d3rMU2//AOX8k/GnWSEWaN0lpYA1FEAAAAAAAAAAAAAAAARu+4+eGmWO+s8p+EpJ063H63S5MfjNez4o8te1Jh1jt1tErbAZDRAAAAAAAASuw4/7TLPurH9f6JVS7Vj9Xocfnb2p+1VNbDXrSIZ+Wd2kASuAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB9pW17RWsTa0zyiI75l8XZ0c7R+Va+dyzV54dNPKnOPrX/wC3f8eSTFjnLeKwiz5Yw45vPwvHhbaq7RtGPTzEeut7eaY8bT4fZ3JQH0lKxSsVj4fI3vN7Ta3mQB05AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEfxFuePadqy6u3KbxHVxVn86090f1+xV6vUYdJpr6jUZK48WOOdrT4MV8Vb3k3rX9eOdNNj5xhpPl5z75VeVyIw09vMrvC4s57+/+seUTmyZM2a+bLab5L2m1rT3zM98uIPn304APQAAAF4dDfA2s6ROkPbOGNLN6Ys1/WazNWP7HT17cl/jy7I87TEeL002jb9HtO1aTa9u09NPo9HhpgwYqd1KViIrWPhEQ1u9ATg+mh4O3XjXUYv+p3PP+Saa0x3YMX1pif2rzMT/AOXDZtm8rJ2vr6LuCmq7+oArJgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGDfTF6NPnv0e23zbNP1972Gt8+OKx7WbT8ueXH75iI60R5xMR9ZoG9bnnp6WXRn/4fdI+XVbdp/V7DvU21Wi6scq4r8/pMMeXVmYmI/RtWPCV7iZfySq56fmhhwBdVgAAAAAAAAAAABvP6EnRr82eCb8Z7pp+ruu/UidPFo9rDpO+v+ueV/hFPe1h9HHo6ydJPSXo9rz47TtGk5arc7xPKPU1mPY5+d55V7O3lMz4PSPDjx4cVMOHHTHjpWK0pWOUViOyIiPCFPl5NR0hZwU/NLkAoLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAwZ6cURPQPqZmImY3HTTHu7ZZzYD9O7VRp+g/Himax+U7vp8Uc47+Vcl+z/Qkw/wD0hxk/0loaA12eAAAAAAAAN/fQ66NY4J6Oq73uWn6m979Wuoy9avtYcHfix+7nE9affaIn6sNX/RT6Np6QukvDfXYOvsez9XV6/nHs5J5/R4Z/etE84/RrZ6IxERHKOyFLl5PyQs8en5pAFFaAAAAAAAAAAAAAAAAAAAAAAAAAAAAGvvp7YaZOhXR3tz54t7wXry8/VZq/8WlsE1y/+oBqIp0SbPpYm0Wy77jt2d01rgzc4n7bQlwf/SEeX/SWjwDWUAAAAAAAAAAAAAAAAAAFt6zH6rVZMfhFuz4eDpSO+4+rqKZI/Pr/ADhHMjLXreYaFJ7ViQBG7AAAAHLHWb5K0jvtMRDiq9px9fXU8q87S6pXtaIeWnUTKerWK1isd0Ryh9Bss0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB26PT5dXqsWmwV62TLaK1j3yzDs+hxbbt2HR4fq468pnl9afGftlafRrtHKt93zV7Z50wc48Pzrf0+9e7a4GDpXvPmf6fPfafI739OPEf2ANBlgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI/dd523a4/6zVUpflzjHHbefshza0Vjcy6rS151WNykBZOt4+xxMxotBa0fpZb8v5Rz/AOUfbjzdufs6XRRHvpaf/wDZVtzsMfK5X7N5Fo3rTIwxx8+93/w2h/0X/wDcfPvd/wDDaH/Rf/3PPv8Ahdf4vP8At/LI4xx8+93/AMNof9F//cfPvd/8Nof9F/8A3H3/AAn+Lz/t/LI4xx8+93/w2h/0X/8AcfPvd/8ADaH/AEX/APcff8J/i8/7fyyOMcfPvd/8Nof9F/8A3Hz73f8Aw2h/0X/9x9/wn+Lz/t/LI4xx8+93/wANof8ARf8A9x8+93/w2h/0X/8Acff8J/i8/wC38sjjHHz73f8Aw2h/0X/9x8+93/w2h/0X/wDcff8ACf4vP+38sjjHHz73f/DaH/Rf/wBx8+93/wANof8ARf8A9x9/wn+Lz/t/LI4xx8+93/w2h/0X/wDcfPvd/wDDaH/Rf/3H3/Cf4vP+38sjjHHz73f/AA2h/wBF/wD3OGXjjerxPVrpcf7uOf6zLz/IYXsfZef9mSkRvfEe2bVFq5c0Zc8d2HHPO32+Efaxxr9/3jXRNdRr8s0nvrT2I+6OXNGIMn2l8Uj+VrD9k++8k/wleId+1u85ueafV4azzphrPsx758596KBmXva87tPu16UrSvWsagAcuwAAAAAHpj6PG1U2boP4P0WOkU6214tTavlbNHrbc/fzvPNfq2+iu9MnRhwpkx2i1LbLo7VmO6YnBTtXIxrTu0tKviABy9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhdPXR7pukro512wWjHXX0j8o27Nbs9XqKxPV5z5WiZrPutz8IX6PazNZ3DyY3GpeS+u0up0Otz6LWYb4NTp8lsWbFeOVqXrPK1ZjwmJiYdLZ305+jP5J3/D0h7RpuWi3O0YdyrSvZi1MR7OSeXdF4jlP7Ve2edmsTXx3i9YmGfevWdADtyAAAAAAAAERMzyiOcjOnobdGvz06RI3/ctPGTZdgtXPeLx7ObUd+KnviJjrz+7ET9Zze0UrMy9rWbTqG0Hos9G0dHfRpgrrtPGPfN16uq3GZj2qTMexin9ys9v7U2ZaBkWtNp3LRrERGoAHL0AAAAAAAAAAAAAAAAAAAAAAAAAAAAasf8A1DN1jHw5wpscTznUazPq7Rz7vV0rSP8A+WfultO0K9OXiKu8dNE7VhydbFsuhxaa0R3etvzy2n7r0j/Kscau8kIs86owMA01EAAAAAAc8GHLqM+PBgx3y5clopSlI52taZ5RER4zzcGxfoQ9Gvzj4yycb7pp4vtex3iNLFo7MurmOcf6ImLfGae9ze8UrNpdVrNp1DZ30dujvF0bdGui2fLSnyrqf+q3PJHKeee0R7ET4xSIiseHZM+MsjAx7Wm07loRERGoAHj0AAAAAAAAAAAAAAAAAAAAAAAAAAAAakf/AFDt2r//AGjsdLe1H5Tq8tfKPYpSf/5PubbvPr00OIo37p03DTYsnrMG0afFoKTE9nWiJvf7YvktE/urHFrvJv6Ic86owsA01IAAAAAAAAAAAAAAAAABQb3j62ki/jS3P7EIuXVY/W6fJj/SrPL4raZ/Lrq0T9VzjzuugBUTgAAACV2Gn9rl+FY/+fcik/tFOpoaT42mbSscWu8m/ohzzqirAaakAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK3ZNvy7pueHRYuzrz7Vv0ax3yomSOjzaPyLbZ1+avLPqY515x21p4ff3/cscbD62SI+FXmcj0MU2+fhculwYtNp8enw1iuPHWK1iPCIdgPoYjT5SZ37yAPQAAAAAAAAAAAAAAAAAAAAAAAAAAAALTFYm1piIjtmZ8BYnSFv9rZLbRpL8q1/+4tE98/o/j9yHPmrhp2lPx+PbPfpU4p4xva19JtF+rWOy2o8Z/d/H7llZL3yXm+S1r3tPObWnnMy+DAy5r5Z3aX0+Dj0wV60gARJwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHpB6LO+Y9+6B+F89b88mk0v5Dlrz5zWcNpxxE/5a1n4TDJzT/0AuN6YNbvHAGszRWNTPyhoItPfeIiuWse+axS3L9mzcBk5q9bzC/jt2rAAiSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIbjfhvbOL+E9y4a3jFGTRa/BOK/Z21nvreP2q2iLR74h5gcY7Br+FuKtz4d3OvV1e3am+nyco7LdWeUWj3THKY90w9WGj3p8cNU2zpM2ziPBj6lN60PVyzy+tmwzFbTz/ctij7FviX1br9VfkV3G2uQDQVAAAAAAAAFRteh1e6blpdt2/BfUazV5qYcGKn1sl7TEVrHvmZiHpl0KcCaTo56O9u4a08Y7amlPW67NX++1Fojr2+HdWPdWGs/oKdGvyjvWo6Rt108TpdvtbT7ZF47L55j28nLypWeUe+0+NW5jP5WTc9YW8FNR2kAVFgAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQ8Qbro9j2LX71uOT1Wj0GnyanPfypSs2n+UPLPi3e9XxLxRunEGun/AKncdXk1OSOfOKze025R7o58o90NxPTu4/rtHB+k4E0Oblrd4mM+s6s9tNNS3ZE/v3j7qWjxaTtDiU1XtPyqci250ALauAAAAAAkOGtm3DiLiDQbFtOCc+u1+euDBTu52tPKOc+ER3zPhETL056MeD9u4D4G2zhbbIi2LR4ojJl6vKc2We2+Sffa0zPLwjlHdDXD0EOjbq49T0l7rg9q3X0m0RaPD6uXNH86R8L+5toz+Vk7W6x8LmCmo3IAqJwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAETxlv2j4X4U3TiLX2iNNt2lyai8c+XW6tZmKx75nlEe+YeWe+7nq963vXbxr8nrNXrtRk1Oe36V72m1p++Zbd+nr0gRpNm0HR3oM30+tmut3Hqz9XDWfoqT+9eJt7upXzacNHi01XtPyp57btoAWkAAAAAAAAAAAAAAAAAAAtvWU9XqstPCLTy+C5EJvlOrq4v4Wr/OFXl13Tafjzq2lAAzlwAAAB9iJmeUd65sVPV4qUj82sQt/QU9ZrMVf2uf3dq417h19plV5E+8QALqsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAR2zygEvwltM7tvGPFaPoMft5p/Zjw+3u+9lqsRWIrWIiI7IiPBCcGbT8lbPWMleWozcsmXzjyr9kfz5ptv8PB6WP38y+Y5/I9bL7eIAFtRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARfFG6V2jaMupiY9bb2MMT42n8O/7GI72te9r3tNrWnnMz3zKe443f5T3eaYrc9Np+dMflM/nW/wDnhEIBg8zP6uTUeIfTfZ/H9HFufMgCmvgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJPhTfdx4Y4l2/iDac3qtdt+ornw28OdZ58pjxie6Y8YmYenfR1xXtvG/Be2cUbVb/p9dhi80mYm2K/dfHb31tExPweWLZj0GOkj5G4m1HR/umfq6Ddreu0E3nsx6qI7ax+/WPvpER9aVbk4+1e0fCbBfrOm6wDNXQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABrF/8AUJ0mO/A/DOvnl6zDuWTDXs8L4pmf/wCOGzrWH/6hOspTgjhjQTy9Zm3LJmr8KYpif/5ITcf/AOkI8v8ApLS8BqqAAAAAAAm+A+Gdy4y4w2zhnaadbV7hnjFWZjnFK99rz7q1ibT7olCN0fQV6Nvkrh/UdIe64OWs3Os4NuraO3Hpon2r/G9o5R7qc47LI8uT067d46d7abC8E8N7bwjwntvDe0YvV6PQYK4qedp77Xn9q0zNp98ymAZEztoeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABHcTb1t/DnD2v33dc3qdDoMF8+e/jFaxznlHjM90R4zMQkWonp39JPrMum6Ndq1Hs06mq3eaz3z34sU/D68x+55JMVJvbTi9utdtcOk3i/cOO+Od04p3LnXLrc02x4utzjDijspjj3VrER7+2fFbYNeI1GoZ8zsAAAAAAXR0U8Ga/j/j3a+FtvmaW1eX6bNy5xhw17cmSfhWJ5R4zyjxWu3o9CXo2+bHA9+MtzwRXdd+x1nB1o9rFpO+kf555Xn3RTyRZsnp127x0720zxw/tOg2HY9Fsu16eun0OhwUwYMcfm0rHKPjPv8VcDJaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAh+NuI9t4R4T3LiXdsnq9Ft+Cc2TztPdWse+1pise+YTDTT07Okn5Q3rT9HO1Z+em2+1dTulqz2XzzHOmP4VrPWn32jxqkxY/Utpxkv1rtrvx5xPuPGXGG58T7tbnq9wzzltETzile6tI91axFY90IQGvEa9oZ/kAAAAAAAAAAAAAAAAAAAARu+054MeT9G3L7//AOiSU25U6+hyx5Rz+7tR5q9qTDvHOrRK3gGQ0AAAAEhsdOtqrX/Rr/NNI3YacsOTJ525fd//AFSTU41dY4Uc07vIAnRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC5eANo/L91/K81een0sxaecdlr+Ef1+7zW7gxZM2amHFWb5L2itax4zLL/D+249q2rDo6cptWOeS0fnWnvn/wCeEQu8LB6l9z4hn/aPI9LH1jzKvAbr5oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAW/x3u/ybtE4cVuWo1POlOXfWv51v6fan8l648dsl7RWlYmbTPdEQxDxLul923bLqp5xj+rirPhSO78ftU+bn9LHqPMr/ANn8f1su58QjQGC+mAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHdoNXqdBrtPrtFnyafVafLXLhy455Wx3rPOtonwmJiJdID026DOPdN0j9HG3cR4+pXV9X1GvxV/utRSI68e6J5xaPdaF8NA/Q46SPmV0j12PcdR1Nl3+1NPk60+zi1HPliye6OczWfdaJn6rfxlZ8fp218L+K/aoAhSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADR309+Jabn0n7bw7hyxfHsuh55IifqZs0xa0f6K4p+1uRxzxLtvB/CW58Tbvk6mj2/BbLeImIm891aV5/nWtMVj3zDzA4w37XcUcU7nxFud+tq9x1N9Rk7ecVm084rHuiOURHlELfEpu3b6K/ItqNIoBoKgAAAAAC+Og3gLVdI/SPt3DmKL10kz6/X5q/wB1p6THXn4zzise+0PS/btHpdv2/T7fosFMGl02KuHDipHKtKViIrWPdEREML+h30bfMjo4rvO44Opve/1pqc0Wj2sODlzxY/dPKZtPd225T9WGb2Zycne2o8Qu4ada7AFdMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAtbpX400HR/wAA7nxTr+V40uLlgwzPKc+a3ZjpHxtMc/KOc+DzI4g3bX79vmt3rdNRbUa7XZ758+Sfzr2nnPwj3eDO3psdJUcU8c04P2vUdfadgvauaa251zavuvPv6kexHlPX82vbS42PpXc+ZUs1+1tACyhAAAAAKxNrRWsTMzPKIjxBkv0bujnJ0kdJmj23UYrTtGj5avc7x2R6qs9mPn53nlXz5TafB6Q4sePFipixUrjx0rFa1rHKKxHdER4QxT6LfRvHR10Z6fHrcEU3vderq9xmY9qkzHsYv8lZ/wBU282WGXyMne3t4hexU61AECUAAAAAAAAAAAAAAAAAAAAAAAAAAAAABZfTVx5o+jno83HiXUdS+opX1Wiw2n+21FufUr8O+0+6svM3dNdq903LVbluGe+o1mrzXzZ8t/rZL2mZtaffMzMs2emT0lfPTpEnYNt1EZNl2C1sFJpPs5tR3Zb++ImOpH7szH1mC2nxsfSu58ypZr9raAFhCAAAAAAAAAAAAAAAAAAAAPloi1ZrPdMcpfQFrXrNbTWe+J5S+KjcqdTXZY87c/v7VOxrRqZhpVncbAHL0ABP7VTqaHH5zzn+arcMFPV4aU/RrEObZpHWsQzbTuZkAdPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFTtmjzbhr8OjwR7eW3Ln5R4zPwjtexEzOoeTMVjcrq6Nto9bnvu2avsY+dMMTHfbxn7O77fcv50bfpcWh0WHSYI5Y8VYrHv9/wAZ73e+i4+GMVIq+T5Wec+SbfwAJ1cAAAAAAAAAAAAAAAAAAAAAAAAAAAAB06/VYtFosurzzyx4qza34PJmIjcvYiZnULW6SN3/ACfR12vDb6TPHWyzHhTy+2f+Pex6qd01uXcNwzazPPt5bc+XlHhH2R2KZ87yM05ck2+H1fEwRgxxX5+QBAsgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAETMTzieUvRb0Wukf/AMROjLT5NdnjJve1dXSbjE29q8xHsZp/frH+qLeTzpZN9GrpFt0cdJuj3DU5rV2fXctJudec8oxWmOWTl50nlbz5daI70OfH3r+6TFfrZ6Qj5S1b0relotW0c62iecTHm+spfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWV028eaTo56Otx4kzzjtqaV9ToMN/77UWiepXl4xHbaf2ay9iJmdQ8mdRuWs3p1dJPylvmn6O9q1PW0m3WjUbnNLdl9RMexjnl3xSs85j9K3nVq+qNz12r3PctTuOv1F9Rq9Vltmz5bzztkvaZm1p98zMyp2vjpFKxEM+9u07AHbkAAAAZe9FLo2/8QukrFk1+D1mx7P1dXr+tHs5J5/R4Z/emJmf2a29zEmDDl1GfHgwY75cuS0UpSkc7WtM8oiI8Z5vSf0eOjvF0a9Gui2bJSk7pqP8AqtzyV7etntEc6xPlSIisefKZ8ZQcjJ0r7eZS4adrMiAMteAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGM/ST6RqdG/Rnq9x0+Wsbxreek2ynj620duTl5Urzt5c+rHiyZaYrWbWmIiI5zM+Dzn9KLpInpG6TNRm0ebr7JtfW0m2xE863rE+3l/z2jnz/RikeCfBj729/CLLfrVivLkyZct8uW9smS9pta1p5zaZ75mfGXEGoogAAAAADO/oZ9G3zy6QvnFuWCL7NsFq5rRevOubUz246e+I5defhWJ+swjtWg1m67npds2/BfUazV5q4cGKkc5ve0xFYj4zL0z6GOBdH0ddHe28M6b1d8+KnrdbnpHL1+ot23v8O6I5/m1rHgr8nJ0rqPMpsNO1tryAZi6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMS+lP0k/wDh30a57aHPFN83XraTb+U+1j5x7eb/ACRPZ+1NWWM2THhxXzZslMeOlZte9p5RWI7ZmZ8IebfpG9IuTpJ6S9ZuuDJf5J0nPS7ZSezlhrP1+XneedvPlMR4J+Pj729/EIs1+tWN5mZnnM85AaiiAAAAAAAAAAAAAAAAAAAAAAAAhd9py1Nb/pV/4R6Y36nPDjv5W5ff/wD0Q7L5EaySvYZ3SABAlHZpa9fU46edoh1qvaK9bXU/ZiZ/k7xxu0Q5tOqzKfAbDOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGQejfaPUaS26Zq/SZo6uKJjup4z9s/yj3rQ4b2y+7bti0kc4x/Wy2jwrHf8Ah9rLuKlMWOuPHWK0pEVrWO6IjuhpfZ+Dtb1J+GR9qcjrX0o8z5cgGwwQAAAAAAAAAAAAAAAAAAAAAAAAAAAAABYXSVu/rM1Npw29nHyvmmPG3hH2d/2x5Lv3/cse1bVm1l+UzWOVK/pWnuhh/PlyZ8182W03yZLTa1p8ZnvZ32hn619OPlrfZfH729WfEf24AMZvgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAN8PQr6SPnZ0fzwtuWo6+77BWuKvWn2sulnsx29/V5dSfKIp5s/PMHob441nR50h7ZxPpevfFhyer1mGs/wBtp7dmSnx5dseUxE+D012ncNHuu16XdNu1FNTo9XhpnwZaTzreloia2j4xMMzk4+ltx4ldw37V0qQFdMAAAAAAAAAAAAAAAAAAAAAAAAAANBfTI6Sfnp0iW2HbdR19l2C1sFJrPs5tRz5ZcnviJjqR+7Mx9ZtB6U/SRHR50Z6idDqIx75uvW0m3xE+1j5x7eaP3Kz2T+lNXnXMzM85nnK7xMf55Vs9/wAsAC8qgAAAAJHhnZdw4j4h0Gw7Vh9drtfnpgwU7om1p5c5nwiO+Z8IiZBnz0H+jb5xcY5OONzwRbbdjyRGli0c4y6uY5xP/pxMW+M0bwrb6MuENv4E4G2vhbbeVsWiwxXJl6vKc2We2+Sffa0zPu7I8FyMnNk9S22hjp0roAROwAAAAAAAAAAAAAAAAAAAAAAAAAAAAFLu+4aPadq1e6bjqKafR6PDfPny37qUrEza0/CIkGEPTO6Sfmf0fTw1tuo6m87/AEth51n2sOm7sl/dNufUj42mO5oUvDpk451vSL0hblxPq+vTFmv6vR4LTz9Rp69lKfHl2z52m0+Kz2thx+nXShkv3tsASowAAAAE5wDwvuXGnGO2cMbTTnq9fnjHFpiZjHXvte3L82tYm0+6CZ1G5IjbYr0E+jX8u3XU9I+66fnp9Fa2m2ut69l80xyyZY5+FYnqxPna3jVuQiODOHdt4T4V23hvZ8XqtDt+CuHFE8uduXfa3LvtaZm0z4zMpdkZcnqW20MdOtdACN2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAoOI942/h/Yddvm7aiun0OhwWz58k+Faxznl5z4RHjPKAYG9NzpKjhngqnBe16jq7rvtJjUTW3tYdJz5W/wBcxNPhF/c0ZXP0pcZbhx9x3ufFG4zNb6vL9Di584w4o7KY4+FeXxnnPithrYcfp10z8l+9tgCVwAAAAAAAAAAAAAAAAAAAAAAAApN2p1tDfzryn+aAXNqa9fTZKedZj+S2WfzI/FErfHn8MwAKiwJLYa88+S/lXl98/wDZGpjYa8sGS/nbl90f90/GjeSEWadUlJANRRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAT3BG0fKm71tlrz02n5Xyc47LT4V+3/iJd46Te0Vj5R5ckY6Te3iF48B7R8nbTGfLXlqNTyvbnHbWv5sf1+1cQPpMeOMdYrHw+Sy5Jy3m9vkAdowAAAAAAAAAAAAAAAAAAAAAAAAAAAAELxju3yTs9747ctRm+jw+6fG32f88nF7xSs2n4d48c5LRWvmVndIG7/l+6fkeG3PBpZmvZ3Wv4z9nd962Se2ecj5zLknJebT8vrcOKMVIpHwAI0oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3K9BLpI/L9m1XR1umomdVoItqdsm9u2+CZ9vHH7tp60R5Wnwq01TPA/Em5cIcW7ZxLtOTqazb89c1ImZ6t4j61LcvzbRzrPumUeXH3rp3jv1tt6qiG4I4k23i/hPbeJdoydfR7hgrlpzntpP51J/arMTWffEplkTGmh5AAAAAAAAAAAAAAAAAAAAAAAAHHNkx4cV82bJTHjpWbXvaeUViO2ZmfCHJrz6bfST82OCK8GbZn6u679jmM81n2sWk58rz/AJ5iafDru6Um9oiHNrRWNy1g9I7pFydJPSXrN0wZLTtGk56XbKTHKPU1mfb5ed5527e3lMR4MbA161isahnzMzO5AHrwAAAAbd+gh0bdTFqekvdMEda8X0m0xaO6O7Llj+dI/wA/m1s6KeDNfx/x7tfC23zNLavL9Nm5c4w4a9uTJPwrE8o8Z5R4vTjh/adBsOx6LZdr09dPodDgpgwY4/NpWOUfGff4qnKydY6x8p8FNz2lXAM9cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGq/p29JP5Htmm6N9qz/T6yK6rdbVntriieePF/mtHWnx5Vr4WbFdIXFW28E8GbnxRu1+Wm0GGcnU58py37qY499rTFY+LzE4w4g3LirifceIt3y+t124Z7Zss+ETPdWPKIjlER4RELXFx9rdp+EGe+o1CKAaKmAAAAAAN1PQY6NvkfhvP0g7pgmuu3Wk4dvrevbj00T23+N7R/prEx2Way9BPAGp6SOkjb+HaRkroon1+4ZqR/Zaekx1p5+EzzisT52h6XaHS6bQ6LBotHhpg02nx1xYcVI5VpSscq1iPCIiIhU5WTUdYWMFNz2l3AM9bAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGpHp39JXL8m6NNp1Hf1NVu80n7cWGf5ZJj/wAv3tkelLjHb+AuBNz4o3GYtTSYvosXPlObLPZTHHxtMfCOc+DzH4j3jcOId/12+brnnPrtdnvnz5J8bWnnPLyiO6I8IiIW+Lj7W7T8K+e+o6wjwGgqAAAAAAAAAAAAAAAAAAAAAAAAAAC2M1eplvT9G0wudb2516muyx5zz+/tU+ZH4YlY48+8wpgFBbE9s9eroaz+lMz/ADQK49DXq6PFH7ESt8SPxzKDkT+F3gNBTAAAAAAAAAAAAAAAAAAAAAAAAAAAAfaVte0VrE2tM8oiO+ZZc4W2qu0bRj08xHrre3mmPG0+H2dyzujnaPyrXzuWavPDpp5U5x9a/wD27/jyZFa/2fg1HqT8+GF9qcjtb0q/HkAabHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJmIiZmeUR3yxNxdu07tu98tJn8nx+xhj3R4/b3/cvHpD3f8AIts/IcNuWfVRMTy/Np4/f3fexsyPtDPufTj/ANbn2Vx9R6tv/ABmNkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABtJ6CXSR+QbvqujndM8Rptda2p2y157KZoj6TH/AJqx1ojzrPjZuU8m9o3DWbTuuk3TbtRfT6zR5qZ8GWnfS9Zia2j4TEPTXoc440XSJ0e7bxPpOpTJmp6vV4azz9RqK9mSnw59secTE+LP5WPU9o+VvBfcdZXeAqLAAAAAAAAAAAAAAAAAAAAAACh4g3bQbDseu3rdM8afQ6HBfPnyT+bSsc57PGezsjxl5j9KvGev4/493TincOdLavL9BhmecYMNezHjj4ViOc+M858Wyfp39JPUxabo02vPHWvFNXu01nujvxYp/lef8nm1EaHFx9Y7T8qee+56wALaAAAAABkv0bujnJ0kdJmj23UYrTtGj5avc7x2R6qs9mPn53nlXz5TafB5a0VjcvYiZnUNnfQl6NvmxwPfjLc8EV3XfsdZwdaPaxaTvpH+eeV590U8mwzjix48WKmLFSuPHSsVrWscorEd0RHhDkyL3m9ptLQrWKxqABw6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAWF09dIGn6N+jfX7/NqTr7x+T7dit/eai0T1ezxisRNp91Ze1ibTqHkzqNy1l9ObpK+WuJ8HAG1aiLaDaL+t180nsyaqY7Ke+KVn/Va0T21a0O3WanUa3WZtZq818+oz5LZcuS887Xvaec2mfGZmZl1NfHSKViIZ97dp2AO3IAAAADMfomdG3/iB0lYtTuGn9Zsey9XVa3rRzrlvz+ixT+9aJmY8a1tHjDm1orG5e1rNp1DaD0Qejb5i9HFNz3HT9Te99iup1HWj2sWLl9Fi93KJm0++3Ke6GawZF7Ta0zLRrWKxqABy9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAY39IzpFxdG3RprN1w5Kxu2q56XbKTymZzWifb5eVI52n4RHi9rWbTqHkzERuWsXpudJXzl40pwVteo621bFefymaz7ObWcuVvj6uOdY9839zXZzz5cufNfPnyXy5clpve97TNrWmeczMz3zLg2KUilYrDPtabTuQB05AAAAAAAAAAAAAAAAAAAAAAAAAAEHvdeWsif0qRKcRO/19rFbziYV+VG8cpcE/jRYDMXhdFK9Wla+Uclt6evW1GOvnaI/muZe4ceZVeTPiABdVgAAAAAAAAAAAAAAAAAAAAAAAAAB26PT5dXqsWmwV62TLaK1j3y6l9dGu0cq33fNXtnnTBzjw/Ot/T702DFOW8VV+TnjBjm8rs2fQ4tt27Do8P1cdeUzy+tPjP2yqwfRxEVjUPk7Wm0zMgD14AAAAAAAAAAAAAAAAAAAAAAAAAAAAOvU5sen0+TPmtFceOs2tPlEOxZPSVu/VpTaMNu23K+fl5fm1/r9yHPljFSbSn4+Gc2SKQtHfNwybpuebWZOcdefYr+jWO6FED5y1ptO5fWVrFYiseIAHjoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZ/8AQq6SJ4U4/nhTctR1do4gvXHTrT7OLV92O0eXW+pPnPU8mAH2lrUvW9LTW1Z51tE8pifNzekXrMS6raazuHraMZejX0i16R+jLR7jqctbbvouWk3KvjOWsRyycvK8creXPrR4Mmse1ZrOpaETExuAB49AAAAAAAAAAAAAAAAAAFt9JnF+3cCcD7nxTucxOLRYZtTF1uU5sk9lMce+1piPd2z4LkaP+nB0k/OHjHHwNteo6227JeZ1c1nsy6uY5TH/AKcT1f3pv5JcOP1LacZL9K7YC4m3rcOI+Idfv265vXa7X57589+6JtaefKI8IjuiPCIiEcDW8M8AAAAAArE2tFaxMzM8oiPF6Lei30bx0ddGenx63BFN73Xq6vcZmPapMx7GL/JWf9U282sHoZ9G3zy6Q44h3LT9fZtgtXPaLR7ObU9+KnviOXXn4VifrN91Hl5PyQtYKfmkAUlkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAefPpddJXz96Scmg27Uxk2LY5tpdJNJ51y5Of0uX385jqxPd1axPjLaD0uOkr5g9G+TQ7dqPV77vcW0uk6s+1ix8vpcvu5RPKJ/StE+EvPde4mP88qvIv8AlgAXVYAAAAAB2aXBm1WpxabTYr5s+a8Y8eOkc7XtM8oiI8ZmXpT6P3R7h6NujXQbHNazuOaPyrcskfnai8R1o5+MViIrHnFefjLWP0HOjb5f4tzcd7ngmdu2W/U0UWjsy6uY58//AE6zE/G1J8JbuqHKybnpC3gpqO0gCmsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEzERznsh52elR0kz0idJWf8h1E5Ni2mbaTb4ifZycp+kzR+/Mdk/o1q2f8ATI6SfmX0d22HbdR1N63+tsFJrPtYdPy5ZcnumYnqR+9Mx9VoKvcTH+eVXPf8sAC6rAAAAAAAAAAAAAAAAAAAAAAAAAAAACO32vPTUt5X5fySKj3ivPQXnymJ/mjzRvHLvHOrwgQGQ0FRttetrsUftc/uXEgdmjnrqz5RM/yTzR4kfglT5E/iAFpAAAAAAAAAAAAAAAAAAAAAAAAAAArdk2/Lum54dFi7OvPtW/RrHfLMGlwYtNp8enw1iuPHWK1iPCIW10ebR+RbbOvzV5Z9THOvOO2tPD7+/wC5dLc4OD06dp8y+b+0uR6uTrHiABeZwAAAAAAAAAAAAAAAAAAAAAAAAAAAAACl3fXYtt27Nrc31cdecR+lPhH2yw9rdTl1mry6rPbrZMtptaVz9I27/lOurtuG30Wnnnk5fnX/AO0f8ytJh87P6l+seIfR/ZvH9PH3nzP9ACi0gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGWfRY6R56O+k3T31uf1eybr1dJuPO3KtImfYyz+5af8ATNvN6KxMTHOO2Hki399DnpInjbo4rsu5aj1m9bBFNPlm0+1lwcvosnb3zyiaz7685+spcvH+eFnj3/LLOICitAAAAAAAAAAAAAAAAAAMeekJ0h4ejbo1129Uvjnc8/8A0224rdvWz2ieVuXjFY52n4cvF5r6jNm1GoyajUZb5c2W83yXvPO1rTPOZmfGZll30sOkn/xB6Ss2Hb88ZNj2braTQzW3OuW3P6TNHhPWtHKJ/RrX3sPtTj4+lffzKjmv2sAJ0QAAAAqdq0Gs3Xc9Ltm34L6jWavNXDgxUjnN72mIrEfGZUzaT0E+jb8v3fU9I266fnptDa2m2ut47L5pjlkyfCtZ6sT52nxq4yXile0uqV7Tpsv0LcC6Po66O9t4Z03Uvnx09brc1Y/ttRaI69vh3Vj9mtYXmDImZmdy0IjUagAePQAAAAAAAAAAAAAAAAAAAAAAAAAAAB1azU6fR6PNrNXmpg0+DHbLlyXnlWlKxzm0z4RERMu1rV6cvSV8icLYeAdq1M13DeKes180ntx6WJ+rPlOS0cv3a2ie93jpN7RWHN7dY21k6fOkHP0k9JOv37rZI2+k/k+24rdnq9PWZ6s8vCbdtp99pjwWCDXrEVjUM+Z3O5AHrwAAAASfCuxbjxNxJt/D+04fXa7X564MNfDnae+Z8IjvmfCImUY3A9BHo1nT6TU9JW66flkzxbS7TFo7qc+WXLHxn2I+F/NHlydK7d0p2tpsb0b8JbdwNwTtfC21xzwaHDFLZOXKcuSe2+Sffa0zPu58u6FwgyZnc7loRGgB4AAAAAAAAAAAAAAAAAAAAAAAAAAAACn3TXaTbNt1W5a/PTT6TS4b5s+W/wBXHSsTNrT7oiJlUNXfTr6Sfk7ZdP0c7VqJjVbhWuo3OaT20wRPsY+fna0c591Y8LO8dJvaIhze3WNtZ+mzjzV9I3SLuPEufr0017eq0OG0/wBjp69lK/Ge20/tWlZYNeIiI1DOmdzuQB6AAAAAAAAAAAAAAAAAAAAAAAAAAAADo3CvW0WaP2Zn7ne4Z69bBkr51mP5PLRuJh7WdTC2AGK0khsUc9Ve3lT+sJpE7BHt5reURH/KWafGj/8AHCjn/wBwBYRAAAAAAAAAAAAAAAAAAAAAAAACX4S2md23jHitH0GP280/sx4fb3feiI7Z5QytwZtPyVs9YyV5ajNyyZfOPKv2R/PmtcTB6uT38Qpc7kehi9vM+E3WIrEVrEREdkRHgA+gfLgAAAAAAAAAAAAAAAAAAAAAAAAAAAAACL4o3Su0bRl1MTHrbexhjztP4d/2JRi3jjd/lPd7UxW56bT86Y/KZ8bfb/xEKvLz+lj3HmVzg8f18up8R5QN7Wve172m1rTzmZ75l8B8++pAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAF89BfHuo6OOkjbuIqTe2j63qNwxV78mnvMdeIjxmOUWj31hYw8mImNS9idTuHrRodVptdosGt0eamfTajHXLhy0nnW9LRzraJ8YmJiXc1o9BjpIjeeF8/AG6ajnr9or63QTee3JpZntrH7lp+69YjubLsjJSaWmstClu0bAHDoAAAAAAAAAAAAAAYS9MDpK+Y3Rxfatu1Hq9832ttNp5rb2sOHlyy5fOJ5T1Ynztz8GZ9dqtNodFn1uszUwabT47Zc2W88q0pWOdrTPhEREy80enXj/AFPSR0j7hxFecldFFvUbfht/daesz1I5eEzzm0++0rHHx97bnxCHNfrVYoDTUgAAAAAE5wFwxuXGfGG2cM7TTravX54x1tMc4x177Xn3VrE2n3Q9O+C+Hdt4S4U23hvaMXq9Ft+CuHHE99uXbNp/atMzaZ85lr36C/Rt8kcOZ+kLdcERrd1rOHbq2r249NE+1ft7pvaP9NYn85s2zuVk7W6x8LmCnWNyAKqcAAAAAAAAAAAAAAAAAAAAAAAAAAAAABFcX7/t3C3DG48Rbvm9VotvwWz5beMxEdlY87TPKIjxmYh5i9IfFW48bcabnxRutuep1+ab9TnzjFSOylI91axER8GxXp29JX5XuOm6Ntq1E+p0k11O7TSey2WY548U/uxPWmO7navjVqs0eLj617T8qee+51AAtIAAAAAAF2dEXBOu6QukDbOF9F1611GTrarNWOfqMFe3Jfy7I7uffMxHi9Ntj2zQ7Ls2j2jbNPXT6LRYKYNPir3UpWIiI+6O9gz0K+jX5p8BzxZuen6m77/St6RaPaw6Tvx193W+vPu6vkz+zeTk721HiF3DTrXYArJgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEJx5xNtvBvB+58Tbtfq6Tb8E5bRE8pvburSPfa0xWPfMPMTjbiTcuLuLNy4k3fL6zWa/PbLfyrHdWkfs1iIrHuiGwvp1dJPyrxBp+jza8/PR7ZaM+42rPZk1Mx7NPhSs8599+3tq1iaXFx9a9p+VPPfc6gAWUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC1rR1bTHlPIdmqjq6nLXyvP/IxZjU6aUe8JLYY+iyz52iEmj9ijlpLz53n/iEg1cEaxwo5f95AEqMAAAAAAAAAAAAAAAAAAAAAABzwYsmbNTDirN8l7RWtY8ZkeeFxcAbR+X7r+V5q89PpZi0847LX8I/r93myYoOH9tx7VtWHR05Tasc8lo/OtPfP/wA8IhXvoeLh9LHr5fLczkevlmfiPAAsqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAD5kvXHjtkvaK0rEzaZ7oiAW/x3u/ybtM4cVuWo1POlOXfWv50/0+1i9JcS7pfdt2y6qecY/q4qz4Uju/H7Ua+e5Wb1cm48Q+p4XH9DFET5nyAKy4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAuDo64r3HgjjXa+KNrtP5Roc8XnH1uUZad18c+61ZmJ+L074V3zbuJuG9v4g2nN67Q6/BXPht48rR3THhMd0x4TEw8pG2PoH9JEYs+q6Nd0z8qZZtq9ptae63flxR8Y9uI91/OFXlY+1e0fCfBfU6begM5cAAAAAAAAAAAAARPGPEO28KcLbjxHu+X1Wh2/BbNlmO+eXdWPO0zyiI8ZmCI2Ne/Tn6SfkfhvB0fbXnmuu3WkZtwtS3bj00T2U+N7R/prMT2WaVp3pA4p3LjXjLc+KN2tz1WvzzkmsTzjHXupSPdWsRWPdCCa+LH6ddM/JfvbYAkcAAAAC+egvgHU9JHSPt/DuPr00fP1+4Zq/wB1p6zHXnn4TPZWPfaFjPQH0Pujb5j9HFN23HBFN736tNTn61faw4eXPFi84nlPWmPO3L81DnyenXfykxU72Zn0Gk02g0On0OiwY9PpdPiriw4sccq46VjlWsR4REREO4GUvgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC0OmPjjRdHfR7uXE+r6l8mGnq9JhtPL1+ot2Y6fDn2z5REz4LvaGemh0k/O/pA+bO25+ts/D97YZms+zm1Xdkv74ry6kfC0x9ZLhx+pbSPJfpXbB+8bjrd43bV7ruWovqdbrM18+fLfvve0zNpn7ZUgNZQAAAAAAGUPRm6OLdI/SZpdFqsM22bb+Wr3O3LstjrPs4ufne3Kvny60x3MYUra960pWbWtPKtYjnMz5PRv0Y+jivRx0aabS6vDFN63Hlq9ytMe1W8x7OL4Ur2fGbT4oORk6V9vKXFTtZlGla0pWlKxWtY5VrEcoiPJ9BlrwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsfpy4903Rx0cbhxHl6l9XEeo0GK397qLxPUj4Rym0+6sr4aAemH0k/PfpHvs+3Z5tsuw2vpsPVn2c2fnyy5PfHOIrHf2V5x9ZNgx+pbXwjy36VYX3HWarcNw1G4a3PfPqtTltmzZbzzte9pmbWn3zMzLoBqqAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC3dxjlrcsftcxz3aOWvye/lP8oGPkjV5aNP8AWElssctFE+dpVqk2iOWgx+/n/wAyq2pi/wBIUcn+0gCRwAAAAAAAAAAAAAAAAAAAAAALz6Nto9bnvu2avsY+dMMTHfbxn7O77fctXbNHm3DX4dHgj28tuXPyjxmfhHazDt+lxaHRYdJgjljxVise/wB/xnvX+Bg737z4j+2X9p8j06enHmf6d4DbfPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC0Okjd/yfR12vDb6TPHWyzHhTy+2f+PeunX6rFotFl1eeeWPFWbW/Bh3dNbl3DcM2szz7eW3Pl5R4R9kdihz8/SnWPMtL7N4/qZO8+I/tTAMR9GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK7h/dtfsO+aHetrzzp9doc9M+DJH5t6zzjs8Y7O2PGFCA9R+izjLb+PuBNs4o2/lWurxR67FE85w5o7L45+FufxjlPiudo56EHSR83ONMnBG56jq7Zvt4nS9aezFrIjlXl/5kcq/GKe9vGyc2P07aX8d+1dgCJIAAAAAAAAAANOfTt6SZ1m6afo32vP9Bo5rqd0ms9lssxzx4p/drPWn32r41bLdMfHOi6O+j3cuJ9XFcmTDT1ekwzPL12e3ZSnw59s+VYmfB5l7vuGs3bddXum46i+o1mszXz58t++97TM2tPxmZW+Lj3PafhXz31HWFKA0FQAAAABz0+HNqNRj0+nxXy5st4pjpSOdrWmeUREeMzIMu+if0bf+IPSVhzbhgjJsezdXV66LV51y25/R4Z8J61o5zH6Nbe56HMeej30eYejbo10Oy3pjnc8/wD1O5Za9vWz2iOdefjFY5Vj4c/FkNlZ8ne37L+KnWoAhSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOOS9MeO2TJetKVibWtaeUREd8zIMWek/0kV6OejTU6jR5upve59bSbbETytS0x7WX/JWef701jxec1pm1ptaZmZnnMz4sm+kr0jX6SOkvV6/TZbW2fQ89JtlfCcdZ7cnLzvPO3ny6seDGTVwY+lffyo5b9rACZEAAAAAq9l23Xbzu+k2nbdPfU63WZq4MGKkdt72nlEffIM5ehb0a/O7j6eKdz0032fYL1yV60ezm1Xfjr74r9effFOfZZvitHof4H0PR50f7bwxoupe+CnX1Wasf2+e3bkv8OfZHPurFY8F3MnNk9S21/HTpXQAiSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOGozYdPp8mo1GWmLDipN8l7zyrWsRzmZnwiIBiL0r+kn/w+6Nc2Lb9R6vfN462l0PVnlbFHL6TLH7tZ5RP6VqvPFkT0hukPN0k9JWu3nHe/wAl6efyXbMc9nVwVmeVuXhNpmbT8eXhDHbVwY+lf3UMt+1gBMjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQW9Ry10z51gc99jlq6z50j/AJkZOb/6S0Mf+kJHbI5aDF8P6qlT7fHLRYf3VQ1Mf+kKN/8AaQB05AAAAAAAAAAAAAAAAAAAAAVezaG+47pp9FTnHrb8pnyr3zP3c3sRNp1Dm1orEzK9ujfafUaS265q/SZo6uLn4U8Z+2f+PevBxw4qYcNMOKsVx0rFa1jwiO5yfSYcUYqRWHyXIzTmyTeQBKhAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUO/7lj2ras2svymaxypX9K090ObWisbl1Ws3tFY8ytDpK3f1mam04bezj5XzTHjbwj7O/wC2PJZbnny5M+a+bLab5Mlpta0+Mz3uD5zNlnLebS+s4+GMOOKQAIk4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADnp82bT6jHqNPlvizYrxfHek8rVtE84mJ8JiXpT6PnSFi6SejTQ75e1I3LD/0u5Y69nVz1iOcxHhFomLR+9y8HmmzL6I/SR8wukvFo9w1Hq9k3yaaTWdaeVcWTn9Flny6szMTPdFb2nwQcjH3r7eYS4b9bPQkBlrwAAAAAAAADFnpPdJEdHHRnqdTo80U3vcuek22IntreY9rL/krPP8Ae6seLqtZtOoeTMRG5av+mh0k/O/pB+bO25+vs+wWthmaz7ObVd2S3+X6kfC0x2WYELTNrTa0zMzPOZnxGvSsUrEQzrWm07kAdPAAAABsf6D3RrPEPGGTjrdNP1ts2S/V0kXr2ZdXMc4mP/LiYt7rWpPgwFwvsm48S8RaDYNpwTn12vz1wYaeHWtPLnPlEd8z4REy9OejThHbuBeCNs4X2yInDosMVvk6vKc2Se2+Sffa0zPu7vBW5OTrXUeZTYKdp2uMBmroAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA189NjpJ+a3AleENszzXdt/pauWaW5Ww6SOy8/559iPOOv5M7b/ALroNi2TW7zumorp9FosF8+fJburSsc5+33eLzI6WeNNf0gcfbnxRr+tX8qy8tPhmecYMFezHSPhHLny75mZ8VnjY+9tz4hDmv1rpaoDSUgAAAAABtZ6CPRr+Va7U9JO66fnh0020u0xev1snLlkyxz/AEYnqRPnN/GrXPo64T3LjjjXbOF9qr/1GuzRSbzHOuKkdt8lvdWsTP2PTrhLYdt4X4Z27h7aMPqdDt+CuDDXs5zER22nztM85mfGZmVXlZOtesfKfBTc7lKAM5cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGuPpwdJXze4Px8DbXn6u5b5SZ1c1ntxaSJ5TH/qT7P7sX84Z94n3vbuG+Hdfv27ZvU6HQYL589/Hq1jnyiPGZ7ojxmYh5i9JnF248dccbpxRuUzGXW5ptTF1ucYccdlMce6tYiPf3+Kzxsfa258Qhz36xqFuANJSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQ+/R/1GOf2f6j7v8fSYp90jK5H/ANJX8X+kJHQxy0eH9yP+Hc6tH/8AaYf/AC6/8O1p0/1hRt5kAdPAAAAAAAAAAAAAAAAAAAABenRfoutqNVuFo7KVjFT4z2z/AC5festlTgPTfk3DOmmY5WyzbJb7Z7P5RC7wKdsu/oz/ALTydMExHz7J0BuvmgAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjTpA3f8AL90/I8NueDSzNezutfxn7O77158YbpO1bJly47cs+T6PF7pnx+yOc/cxNPbPOWX9oZtR6cf+tn7K4+5nLP8A4AMluAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPQr0SOkiePujTFpNw1HrN72Tq6TWdaedslOX0WWf3oiYmfG1LT4syPNT0e+kLL0b9Jeg3q97fJmefyXcscc562C0xzty8ZrMRaP3eXi9KMGXFqMGPPgyUy4slYvS9J51tWY5xMT4xyZfIx9Le3iV7DftVzAQJQAAAAAHy9q0pa97RWtY52tM8oiPN5w+kx0j26SOkzVa7S5rW2XQc9Jtle6JxxPtZOXne3O3ny6sT3NoPTV6SfmnwFHCm2ajqbvv9LY7zSfaw6XuyW93X+pHu6/k0QX+Jj1HeVXPf8ALAAuKwAAAAC6uibgvX9IHH22cL6DrV/KsvPUZojnGDBXtyXn4Rz5c++ZiPF5MxEbkiN+zZP0EOjX1WDU9Je66f28nX0u0RevdXuy5o+M+xEx5ZPNtiotg2rQbFsmi2ba9PXT6LRYKYMGOvdWlY5R9vv8Vaycl5vbbQpXrGgBG7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAW30mcX7dwJwPufFO5zE4tFhm1MXW5TmyT2Uxx77WmI93bPg9iNzqCZ01x9O/pKnFh03RptWo9rJFNVu80t3V78WGfj2XmJ8qebUNI8T73uPEnEWv37ds3rtdr898+e/h1rTz5RHhEd0R4REQjmtix9K6Z17drbAEjkAAAABf/AEA9H2fpJ6SdBsM1vG3Y5/Kdyy17Opp6zHWjn4TaZike+3Pwl5aYrG5exG51DZv0G+jX5D4Vy8e7rporuG8U6mhi0duLSxP1vdN7Rz/drWfFso6tHptPo9Jh0mlw48GnwY648WLHXq1pSscorER3RERy5O1kZLze02loUr1jQA4dAAAAAAAAAAAAAAAAAAAAAAAAAAAAALV6WeNNB0f8A7nxRrurb8lxctPhmeU581uzHSPjPLny7oiZ8HsRMzqHkzr3a2enf0letz6bo02rUexj6uq3eaW77d+LDPwj25ifPH5NTlbv+66/fd71u87pqLajW63PfPnyW77XtPOfs93gomvjpFK6Z97drbAHbkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABFb/Hbhn97+g5b7Wbep5cuzrf0GZyIn1JXsM/ghX6b/AO2xfuR/w7HXpv8A7bF+5H/DsaVfEKU+QB68AAAAAAAAAAAAAAAAAAAAGaNqxeo2vSYP/wBPDSv3VhhdnGIiI5RHKGp9mR72n/pi/bE+1I/7/wD4ANZiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMedJ2rnJumDRxPs4cfWmP2rT+ER960U1xze1+KdbNp7prEfCKwhXznJt2y2n931nEpFMFYj6ACBZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG8foQdJEcR8FZOCdz1HW3TYqR+S9ae3Lo5nlXl5+rn2Z8omjRxdHRXxlr+AePNr4o2/rWtpMseuwxblGfDPZkxz8a8+3wnlPgizY/Urp3jv0tt6jCh4f3bQb9sei3ra9RXUaHXYKZ8GSPzqWjnHwn3eCuZLQAAAAFHve56HZdn1m77nqKafRaPDfPny27qUrHOZ+6FY1S9O7pJjT6HTdG21aj6XURXVbtNZ+rjieeLFPxmOvMeUU83eOk3tpze3WNta+l7jbXdIXSBufFGt69K6jJ1dLhtPP1GCvZjp5dkds8u+ZmfFaQNeIiI1DOmdzuQB6AAAADev0J+jX5rcDW4w3PT9Td9/pFsMWr7WHSd9I93Xn25846nk1g9Gzo5v0kdJmk27UYrTs+i5avc7+Hqqz2Y+fne3Kvny60+D0gxY8eLFTFipXHjpWK1rWOUViO6IjwhT5eTUdIWcFPzS5AKC0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAANH/Tg6SfnDxjj4G2vUdbbdkvM6uaz2ZdXMcpj/04nq/vTfybOekN0h4ujbo0129Y70ndM/8A0u2Y7dvWz2ieVuXjFI52nz5cvGHmxnzZdRnyZ8+S+XLktN73vPO1rTPOZmfGea5xMe57yrZ76jrDgAvqoAAAAAA9CfRI6NvmD0bY9buGn9Xvm9xTVavrRytix8vosU+XKJmZj9K0x4NX/RE6Nfn50kY9x3HT+s2PY5pqtV1o9nLl5/RYvfzmJtMd3VrMT3w9BVLl5PyQs8en5pAFFaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGinpsdJU8U8dV4P2zUdbaNgvNcs0tzrm1fLlef8AJHsR5T1/Ns96SnSNTo36NNXuOmy0jeNbz0m20me2Mlo7cnLypHO3lz6seLzgyXvkyWyZL2ve0za1rTzmZnvmZXeJj3PeVbPf8sOIC8qgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI/eP7r7f6BvH919v9BQz/7yt4v9YVmm/wDtsX7kf8Ox16b/AO2xfuR/w7F6viFWfIA9eAAAAAAAAAAAAAAAAAAAADOFZi1YtE84mOcMHszbJm/KNn0ebnz6+Ckz8eUc2p9mT72j/pjfbEe1J/7VYDWYYAAAAAAAAAAAAAAAAAAAAAAAAAAAAADFXHeOcfFOr591uraPtrCDXn0o6Oa6vS6+sezek4rT747Y/lM/csx85yq9ctofWcO8XwVn9v6AECyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2+9A/pI9bptV0bbpn+kxdbV7TNp76d+XFHwn24j338m2Dyk4U33ceGOJdv4g2nN6rXbfqK58NvDnWefKY8YnumPGJmHp30dcV7bxvwXtnFG1W/6fXYYvNJmJtiv3Xx299bRMT8GdysfW3aPlcwX3GlwAKqcABb/AEi8WbbwPwXufFG62/6fQ4ZvFInlbLeeymOvvtaYj7XmLxbv25cUcS7hxDu+ec2u1+e2fNbw5zPZEeVYjlER4REQ2B9OXpK+XOKsPAO1ajrbfs9/Wa6aW7MuqmPq++MdZ5fvWtE9zWppcbH1r2nzKlnv2nUACyhAAAACsTa0VrEzMzyiI8Rnn0Mejb549IPzk3LBNtn2C9c3K1fZzanvx098V5defhWJ+s5vaKVmZe1rNp1DZ/0XujeOjnoz0+DWYepve6dXV7lMxytS0x7GL/JWeXL9Kbz4srAyLWm07lo1iIjUADl6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAwf6YnSV8yOjm2y7bqIpve/Vtp8XVn2sODlyy5PdPKYrHvtzj6suqVm9oiHlrRWNy1f9K3pJ/wDELpKy49Bn9Zsez9bSaDqz7OSef0maP3piIj9mtfexCDXrWKxqGdaZtO5AHTwAAAAd2i0uo1uswaPSYb5tRnyVxYsdI52ve08orEeczMQ6Wy/oM9Gsb1xNn4/3XT9bQbRf1Wgi8dmTVTHbf/JWY/zWrMdtXGS8UrNpdUr2nTZroF6P9P0b9G237BFcc6+0flG45a9vrNRaI63b4xWIise6sea/QZFpm07loRGo1AA8egAAAAAAAAAAAAAAAAAAAAAAAAAAABaYrWbWmIiI5zM+AwN6Z3ST8z+j6eGtt1HU3nf6Ww86z7WHTd2S/um3PqR8bTHc6pWb2iIc2tFY3LV/0oOkiekbpM1OfR55vsm2dbSbbET7N6xPt5f89o5/uxWPBioGxWsVjUM+0zM7kAevAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEfvH919v8AQN4/uvt/oKGf/eVvF/rCr0k89Lhn9iv/AA7XTou3R4f/AC6/8O5dr/rCrbyAOngAAAAAAAAAAAAAAAAAAAAyh0e6qNRw3jxzPO2C9sc/fzj+U/yYvXd0Za6MO5ZtDe3Kuop1qfvV/wC0z9y5wb9M0fv7KH2ji74J18e7IYDefMgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI7iPba7rtGbSTyi8x1scz4Wju/D7WIcuO+LLbFkrNb0tNbVnviY74ZvY+6SNo9Rq67phr9Hmnq5eXhfwn7Y/nHvZv2hg7V9SPhr/AGXyOtvSnxPj/tZ4DHbwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzx6J3TVj6O92y8O8R5b/NncMnX9ZFZtOizzyj1nKO2aTERFojt7ImO6YnA45vSLxqXtbTWdw9Z9BrNJuGiw63Q6nDqtLnpF8WbDeL0yVnumto7Jh3vMfo46VePOj+epwzv+fBpJt1r6PLEZdPafH2Lc4rM+M15T72X9D6YfG+PTTTWcM8P583V5Rkx+uxxz85r155+HZEwoW4l4n291uvIrPluyw76R/TZtHRtsWfbdu1OHVcV6nFy0ulr7Uafn/e5fKI74rPbaeXZy5zGsPGnpQdKXEOmvpdJq9DsGC8dW07bgmuWY/8AMvNrVn316ssK6rPn1WoyanU5smfPltN8mTJabWvae+Zme2Zd4+JO93c3z+2qvus1Oo1mrzavVZsmfUZ8lsmXLkt1rXvaec2mZ75mZ583UC8qgAAAAAKnadv1m7bppdr27T31Os1eamDBipHO172mIrWPjMw9NOhrgbR9HXR5tvDGlmmTLhp6zWZ6x/b6i3be/wAOfZHPurWseDWn0Eujb8t3XUdI+64J9RorW0211vXsvlmOWTLHurE9WJ87W8atx2fysm56x8LeCmo7SAKiwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6Nx1ml27b9RuGuz00+l02K2bNlvPKtKVjna0+6IiXmf04cfavpH6Rtw4jzdemlm3qNBht/c6esz1I+M85tPvtLZj06ekqNr2HB0d7VqOWs3KsZ9ymlu3Hp4n2cc+U3tHOf2a+VmmDQ4uPUdpVM99z1gAW1cAAAAABK8H8P7lxVxPt3Du0YvW67cM9cOKPCJnvtPlERzmZ8IiXp30fcLbbwVwZtfC+1V5aXQYIxxeY5Tkv33yT77Wm1p+LXX0Eujb8j2zU9JG64Pp9ZFtLtVbR21xRPLJl/wA1o6sePKtvCzahncrJ2t1j4XMFNRuQBVTgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKXd9w0e07Vq903HUU0+j0eG+fPlv3UpWJm1p+ERLzL6ZOOdb0i9IW5cT6vr0xZr+r0eC08/UaevZSnx5ds+dptPi2W9O7pJ/I9r03RvteePX6yK6ndbVntriieePFP71o60+6tfCzTlocXHqO0/KpnvuesAC2rgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI7epiPVc55fW/oOvf/wC4/wA39Bm8i2skruGu6QrtB/8AZYf3Id6n22eehxfuqhoU/wBYU7f7SAOngAAAAAAAAAAAAAAAAAAAA79Bqsmi1uHV4Z9vFeLR7+Xg6B7E6ncPJiJjUs16HU4tZo8Wqwzzx5aRav2u5YvRru/K19oz27J53wc58fzq/wBfvX0+jwZYy0iz5Pk4JwZJpIAmVwAAAAAAAAAAAAAAAAAAAAAAAAAAABT7no8O4aDNo88c6Za8pnynwn7JVA8mImNS9iZrO4YV3DSZtDrc2kzxyyYrdWff7/hPe6F/dJO0etwU3bBX28fKmbl418J+yez7fcsF87yMM4rzV9Zxc8Z8cW/kAQLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAneAOF9y404y2zhjaa89Vr88Y4t1ZmMde++SeX5taxNp90IJur6DHRr8j8N5+kHdMHLXbtScO31tHbj00T23+N7R/prH6SPLk9Ou3eOne2mwfBvD228J8Lbbw5tGL1ei2/BXDiieXO3Lvtbl32tPO0z4zMpYGRM7aAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAhuOOJNs4P4S3LiXd8vq9Ht+Cct+3tvPdWlf2rWmKx75hMtMfTq6SvlPfMHR1tWo56TbrRqNytS3Zk1Ex7GPs74pWecx+lbzqkxY/Utpxkv0rtrzxzxLufGPF25cTbvk6+s3DPOW8R9Wkd1aV/ZrWIrHuiEKDXiNezP8gAAAAAC8OhzgbWdInSFtvDGkm2PFmv6zV5ojn6nBXtvf48uyPO0xHis9vr6GPRt8z+j6OJdy0/U3nf6VzcrR7WHTd+Onum3Prz8axPcizZPTrv5SYqd7aZv2jb9HtO1aTa9u09NPo9HhpgwYqd1KViIrWPhEQqgZK+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIHpB4p23grgzdOKN1ty0ugwTkmkTynJfupjj32tNax8U80p9OfpJ+WuJ8HR/tefnodov67XzWezJqpjsr8KVn/AFXtE9tUuLH6ltOMl+ldtfOMOINy4q4n3HiLd8vrdduGe2bLPhEz3VjyiI5REeERCKBrRGmeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAid/wDr4fhP9Bx36fpscfsjK5H/ANJX8P8ApCu2qee34vt/5lVKPZp56Gvumf8AlWNLF/pH/Slk/wBpAHbkAAAAAAAAAAAAAAAAAAAAAB2abPl02ox6jDaa5MdotWY8JhmDZNwxbptmHW4uzrx7Vf0bR3ww2uno83f8i3KdBmtywameVec9lb+H3933L3Bz+nfrPiWd9o8f1cfaPMMkANx82AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4Z8WPNhvhy1i+O9Zras+MSxDxBtuTat1zaO/OaxPWx2n86k90/wDzxhmFbfH+0fl+1flWGvPUaWJtHLvtTxj+v3+alzcHqU3HmGh9ncn0snWfEsZAMJ9KAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvvoI4A1PSR0kbfw9SL10MT+Ubjlr/d6ekx1u3wmecVj32h6W6HS6bQ6LBotHhpg02nx1xYcVI5VpSscq1iPCIiIhhr0Qejb5i9HFNz3HT9Te99iup1HWj2sWLl9Fi93KJm0++3Ke6Ga2ZyMne2o8QvYadagCulAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWT038e6To46Odx4kzTS2qrX1Ogw2/vtRaJ6lfhHKbT+zWXmfuWt1e5bjqdx1+oyajV6rLbNnzZJ52yXtMza0z5zMzLNXpi9JXz26RLbJtupm+ybDa2DF1Z9nNqOfLLk98RMdWJ8qzMfWYNafGx9K7nzKjmv2toAWEQAAAADljpfJkrjx0te9pita1jnMzPdEQDKfov8ARvPSN0mabBrME32TbOrq9ymY9m9Yn2MX+e0cv3YtPg9GaxFaxWsRERHKIjwYy9Gvo5p0b9Gmk27U4qRvGt5avcrxHbGS0dmPn5UjlXy59afFk1l58ne3t4XsVOtQBAlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWF09dIGn6N+jbcN/m2OdfaPyfbsVu31motE9Xs8YrETafdWfN5qa3VajW6zPrNXmvm1GfJbLlyXnna97Tzm0z5zMzLMfpedJXz86Scm3bdqIybHsc202lms+zly8/pcvv5zEVie7lWJjvlhZqcfH0rufMqOa/awAnRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIXfZ/6qkfsf1kcd7nnrY91IGTn/APpLQxf6Qrdjnno5jyvP9Fejdhn/AKfJH7X9Ek0cH/zhTy/7yAJUYAAAAAAAAAAAAAAAAAAAAAAVmazExMxMdsTHgAMtcJbtG7bPjy2n6fH7GaP2o8ft7/vS7FPBm7fJW8Vtkty0+bljy+UeVvsn+XNlaO2OcPoOJn9XH7+YfL87j+hl9vE+ABaUgAAAAAAAAAAAAAAAAAAAAAAAAAAAAntjlIAxTxntPyVu9ox15afNzvi8o86/ZP8ALkhGWuLdpjdtnyYaxHr8ft4Z/ajw+3uYltE1mYmJiY7JifBgczB6WT28S+n4HI9bF7+YAFReAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGY/RM6Nv/EDpKxancNP6zY9l6uq1vWjnXLfn9Fin960TMx41raPGGINLgzarU4tNpsV82fNeMePHSOdr2meUREeMzL0o9H3o9w9G3RrodktSk7lmj8p3LLXt6+e0Rzjn4xWIisfu8/GUHIydK+3mUuGnazIQDLXgAAAAAAAAAAAAAAAAAAAAAAAAAAAAABiL0rOkmOj3o0zV0Ofqb5vHW0mg5T7WOOX0maP3azHKf0rVZaz5cWnwZM+fJTFix1m973nlWtYjnMzPhHJ5tekT0iZeknpL1u8Ysl/krTf9LtmO3Z1cFZn2uXhN552nx7YjwhPx8fe3v4hFmv1qxzMzM85nnIDUUQAAAAABsH6E/Rt86eO7cX7ngi207BetsUXrzrm1c9tI/wAke3PlPU82Cdg2rX77vei2ba9PbUa3W56YMGOvfa9p5R9nv8Hpv0TcF6Do/wCAds4X0PVt+S4ueozRHKc+a3bkvPxnny590REeCvycnSuo8ymw07W2uoBmLoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAw16W/ST8wejbJotv1Hq983uL6XSdWeVsWPl9Lljy5RMRE/pWifBmHV6jBpNLl1WqzUw4MNLZMuS9uVaViOczM+EREc3mp0/dIOfpJ6Sdfv0WvG3Y5/JttxW7Opp6zPVnl4TaZm8++3LwhY4+Pvbc+IRZr9arAAaaiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgd4nnr7x5REfyHDc556/LPv5fyGPlnd5aNP9YVmwT2Zo+E/8pVD7DP0+SvnXn/NMNHjT/8AjhTzf7yAJ0QAAAAAAAAAAAAAAAAAAAAAAAAyZwBu/wCX7V+SZrc9RpYivbPbanhP9Pu82M1fw/uWTat1w6ynOa1nlkrH51Z74/8AnjELPFzelk38KnM4/r4piPPwzEOGDLjzYaZsVovjvWLVtHjEub6F8r4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGN+kPaPyPcY1+GvLBqZ9rl3Vv4/f3/eyQo972/Fum2ZtFl5R16+zb9G0d0/er8nD62OY+Vrh8j0MsW+PlhodmqwZdNqcmnzVmuTHaa2jymHW+emNPqonfvAA8egAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJLhXY9x4l4j2/YNpwzm12vz1wYa+HOZ758ojvmfCIk8DP3oO9G3y/wAXZeO900/W23ZL9TRxaOzLq5jnE/8Ap1mLfvWpPhLd5bvRtwlt3AvBO2cL7XHPBocMVtkmvKc2Se2+Sffa0zPu58vBcTJzZPUttoY6dK6AETsAAAAAAAAAAAAAAAAAAAAAAAAAAAABHcTb1t/DnD2v33dc3qdDoMF8+e/jFaxznlHjM90R4zMQeRgT03+kqeHODsXBG16jqbnvlJnVTWfaxaSJ5T/EmJr8K39zR1cnSdxhuHHnHO6cU7lzrl1ubnjxc+cYcUdlMce6tYiOfjPOe+VttbDj9Oumfkv3tsASuAAAAAFx9GfCO48dccbXwvtsTGXW5orfL1ecYccdt8k+6tYmff3eJMxEbkiNtjvQQ6NfW59T0l7rp/Yx9bS7RF699u7Lmj4R7ETHnk8m3qO4Y2TbuG+HdBsO04fU6HQYKYMFPHq1jlzmfGZ75nxmZlIsjLkm9ttCletdACN2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAi+Ld+23hfhrcOId3zxh0OgwWz5rePKI7IjztM8oiPGZiCI2Nf8A05Okr5D4VxcBbVqYruG8U6+ums9uLSxP1fdN7Ry/draPFpKuDpF4s3LjjjXc+KN1t/1GuzTeKRPOuKkdlMdfdWsRH2Lfa+HH6ddM/JfvbYAkcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALb1s89Zmn9uf+RwzT1st7edpkYtp3My0o8KvZJ5a3l50mE4t/ardXX4/fzj+S4GjxJ/AqciPxACygAAAAAAAAAAAAAAAAAAAAAAAAAAX90bbv63Bfac1vbxxN8MzPfXxj7O/wC33LzYV2/VZtDrcOrwW5ZMVotHv93wnuZi2zWYdw0GHWYJ9jLXny8p8Y+yext8DP3p0nzH9PnftPj+nf1I8T/aoAX2YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsXpK2jlam74K9k8qZ+X/42/p9yyGbNZp8Wr0uXTZ69bHlrNbR7pYe3jQZdt3HNos31sduUT+lHhP3MXn4Olu8eJ/t9D9mcjvT058x/SkAZ7UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG3/oIdG3qdJqekrdMExkzdfSbTW0d1Inllyx8ZjqR8L+bWvok4K13SDx/tnC+i69I1OTnqc1Y5+owV7cl/sju85mI8Xpvse16HZNm0Wz7Zgrp9FosFMGDHXurSsRER90KnKyajrHysYKbntKsAZ62AAAAAAAAAAAAAAAAAAAAAAAAAAAAAANRPTv6SYyZNN0a7Vn9mk01W7TS3fPfiwz8Oy8x+55NkulfjPQcAcBbpxRr+raNLi5YMMzynPmt2Y8cfG3Ln5RznweZHEG7a/ft81u9bpqLajXa7PfPnyT+de085+Ee7wW+Lj7T2n4V899R1hQgNBUAAAAAAG8HoPdG3ze4Oycc7pgmu5b5SK6SL15Ti0kTziY/8yY637sUnxlrH6PPR5m6SekrQ7Nkpf5L08/lW55I7OrgrMc68/CbTMVj48/CXpPp8OHT6fHp9Pipiw4qRTHSkcq1rEcoiI8IiFPl5NR0hYwU3PaXMBQWwAAAAAAAAAAAAAAAAAAAAAAAAAAAAABp76d3SV+Va7TdG21ajnh0011W7TS31snLnjxTy/RievMec08atlOl/jfQ9HnR9ufFGs6l76fH1NLhtP8Ab57dmOnny59s8u6sWnweZW9blrt53fV7tuWovqdbrM1s+fLee297Tzmfvlb4uPc9p+FfPfUdYUgDQVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABxvPVpa3lHNydOsnq6TLP7E/8ADyZ1G3sRuVtgMVpO7RW6urxT+3H/ACuRa1J6tot5TzXTHbHNf4c+0wq8mPeJAFxWAAAAAAAAAAAAAAAAAAAAAAAAAAF4dG+7+o1dtrzW+jzT1sUzPdfxj7Y/nHvWe5Yr3xZK5Mdprekxato74mO6UuHLOK8WhDnwxmxzSWbxHcN7nTdtpxauOUZPq5ax4Wjv/H7Ui+jraLRFofJXpNLTWfMADpyAAAAAAAAAAAAAAAAAAAAAAAAAAAALT6Rdo/KtBG5Ya882nj2+X51P+3f967Hy9a3rNbRFqzHKYnumEeXHGSk1lLgyzhyRePhg8SvFO1W2jd8mniJ9Tb28M+dZ8Ps7kU+bvWaWms/D62l4vWLV8SAOXYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADJ3o09HNukjpM0mg1WK07NoeWr3K0R2TjrPZj5+d7cq+fLrT4PLWisbl7ETM6hs/6FHRt81eA54t3LBNd23+lb44tHKcOkjtxx/n+vPu6nk2BfKVrSlaUrFa1jlWsRyiI8n1j3vN7TaWhWsVjUADl0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAxn6SfSNTo36M9XuOny1jeNbz0m2U8fW2jtycvKledvLn1Y8XtazadQ8mYiNy1h9NnpJ+dHHNOD9szzbadhvNc01t7ObVzHK8+/qR7EeU9fza9uWXJky5b5ct7ZMl7Ta1rTzm0z3zM+MuLYpSKViIZ9rTadyAOnIAAAADN/oedG3z36R6bxuOCbbLsNqanN1o9nNn588WP3xzibT39leU/Wc3tFKzMva1m06hs/6KHRt/wCH3Rrhy7hp/V75vHV1Wu60crYo5fR4p/drPOY/StZmAGRa02nctGsRWNQAOXoAAAAAAAAAAAAAAAAAAAAAAAAAAAADFvpOdI9ejjoz1Wq0maKb1uPPSbZWO+t5j2svwpXt5/pTWPF1Ws2nUPJmIjctYPTS6Svndx9HC22amb7PsF7Y7dWfZzaruyW98V+pHvi/LsswE+3ta97XvabWtPO1pnnMz5vjXpSKViIZ1rTadyAOngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApd1t1dBl98RH81UoN7ty0cR+leIR5Z1SXeON2hCAMhoC5tNbr6bFbzpE/yWyuDa7dbQYp8omP5rfDn8Uwr8iPaJVQDQVAAAAAAAAAAAAAAAAAAAAAAAAAAAAFxcB7v8nbtGDLblp9TMUtznsrb82f6fayewcynwRu/yptFa5bc9Tp+VMnOe20eFvt/5iWr9n5/+Of/ABifavH/AOWv/qeAarFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQXG20fKm0Wtirz1On53x8u+fOv2/wDMQxWzixhx5tHydu058VeWn1PO9eXdW350f1+1lfaGD/kj/wBbX2VyP+K3/i3QGU2wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACsTa0VrEzMzyiI8Xo16MPRvHRx0aabTazD1N73Llq9ymY7aXmPZxf5K9n702nxawehf0bfO/pB+c25YOvs/D965oi0ezm1Xfjr74ry68/CsT2Wb5qPLyfkhawU/NIApLIAAAAAAAAAAAAAAAAAAAAAAAAAAAAABaYrWbWmIiI5zM+Dzn9KLpJt0jdJeozaPP19j2vraTbYi3Ot6xPt5v89o58/wBGKR4Nn/TO6Svmf0fTw3tufq7xv9LYedZ9rDpu7Jf3Tbn1I+Np8GhS9xMf55Vc9/ywALqsAAAAAA79v0mp3DX6fQaLBfUarU5a4cOKkc7ZL2mIrWI85mYh6X9BvAWm6OOjjb+HMXUvq4j1+vy1/vdReI68/COUVj3VhrN6CvRt8q8QajpD3TBz0e2WnBt1bR2ZNTMe1f4UrPKPffs7at0VDlZNz1hbwU1HaQBTWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHy9q0pa97RWtY52tM8oiPN5xekz0j26R+kzVa3S5pts2389JtlefZbHWfay8vO9udvPl1YnubP+mp0k/NPgKOFNs1HU3ff6Wx3ms+1h0vdkt7ut9SPd1/Jogv8TH7d5Vc9/ywALisAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIvf7exir5zMpRDb7bnqKV8qc/5oOTOscpcMbvCOAZa8JvY7c9Jav6N5QiV2C3blp8JhY406yQizxuiVAaaiAAAAAAAAAAAAAAAAAAAAAAAAAAAAJXhbdbbRu+PUTM+pt7GaI8az4/Z3oodUtNLRaPhxekXrNbeJZwpat6xasxasxziY7ph9Wn0c7v+VaCdtzW55tNHOnOfrU/7d3w5LsfSYskZaRaHyWfDOHJNJ+ABIiAAAAAAAAAAAAAAAAAAAAAAAAAAAAEdxJtlN22nLpZ5Rk5dbFafC8d34fakRzasWiYl1S80tFo8wwhlx3xZbYslZrelpras98THfDivDpI2j1GrrumGv0eaerl5eF/Cftj+ce9Z75zNinFeay+twZozY4vAAiTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACq2fbtbu+7aTatu099RrdZmpg0+Kvfe9pitYj4zMKVtT6CPRt+WblqekjdcHPBpJtpdqi0fWyzHLJlj92s9WPDna3jVxkvFKzZ1SvadNluhzgfRdHfR7tvDGk6l8mGnrNXmrHL1+ot25L/Dn2R5RER4LvBkTMzO5aERqNADx6AAAAAAAAAAAAAAAAAAAAAAAAAAAAKXd9w0e07Vq903HUU0+j0eG+fPlv3UpWJm1p+ERKqar+nd0k/ke16bo32vPHr9ZFdTutqz21xRPPHin960dafdWvhZ3jpN7ahze3WNtaemXjnW9InSHuXE+q69MWa/q9HhtP9hp684x0+PLtnztNp8Vng14iIjUM6Z3OwB6AAAACY4J4b3Li7izbeG9oxes1mvz1xU8qx32vP7NYibT7olDtzPQU6Nvk7ZdR0jbrp5jVbhW2n2yLx20wRPt5OXna0co91Z8LI8uT067d46d7abD8B8M7bwbwftnDO006uk2/BGKszHKb277Xn32tM2n3zKbBkzO/doeAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAACj3zc9Dsuzazd9z1FdPotFgvn1GW3dSlYmZn7o7lY1R9O7pK/J9HpujbatRMZc/V1W7TSe7H34sU/GYi8x5RTzSY6Te2nN7dY21r6XeNtd0hdIG58Ua3r1rqMnV0uG08/UYK9mOnl2R38u+ZmfFaYNaIiI1DOmdzsAegAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgN3t1tff9mIj+SfW1rLdfVZbed5VOXP4YhY48fimXUAz1sV2yW6us6v6VZj+qhVG3W6mtxT+1y+/sSYp1eJcXjdZhcQDXZ4AAAAAAAAAAAAAAAAAAAAAAAAAAAAACr2jXZdt3HDrcP1sducxz+tHjH2wzDo9Ri1elxanBbrY8tYtWfdLCa9+jXd+Vr7Rnt2Tzvg5z4/nV/r97Q4GfpbpPif7Zf2nx+9PUjzH9L6AbT54AAAAAAAAAAAAAAAAAAAAAAAAAAAAABT7no8O4aDNo88c6Za8pnynwn7JYd3DSZtDrc2kzxyyYrdWff7/AIT3s1LM6Sdo9bgpu2Cvt4+VM3Lxr4T9k9n2+5Q5+DvTvHmP6af2ZyPTv6c+J/tYIDEfRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJ7o+4W3LjXjPa+F9qr/ANVr88Y4vMc4x0775J91axa0/B6d8H8P7bwrwxt3Du0YvVaHb8FcOKPGYjvtPnMzzmZ8ZmWvvoMdG3yLwxn6QN0wctfu9Jw6CLR249LE9tvje0f6aVmOyzZdm8nJ2t1jxC5gp1jcgCsnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQPSDxTtvBXBm6cUbrblpdBgnJNInlOS/dTHHvtaa1j4vMTjDiDcuKuJ9x4i3fL63Xbhntmyz4RM91Y8oiOURHhEQ2C9ObpK+WuJ8HAG1aiLaDaL+t180nsyaqY7Ke+KVn/AFWtE9tWtDS42PrXtPmVLPftOvoALKEAAAAABenQpwJq+kbpE27hvTxkrpr39brs1Y/sdPWY69vj3Vj32h6ZbXodJtm26XbdBgpp9JpcNMODFT6uOlYiK1j3RERDCfob9G3zL6O679uWn6m9b/Wue8Wj2sOn5c8WP3TMT15/eiJ+qzozOTk721HiF3DTrXYArpgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFvdJHFu3cDcE7pxTuk88GhwzeuPnynLknspjj32tMR7ufPuh5i8Vb7uPE3Em4cQbtm9drtfntnzW8Odp7ojwiO6I8IiIZ/8ATk6Sfl7izDwHtefrbdst/Wa2az2ZNXMcuX/p1mY+NrR4Q1taXGx9a7nzKlnv2nQAsoQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHG9urS1p8I5rYmec85XDuNupocs/s8vv7FuqHMn3iFrjx7TIAprI+0tNbxaO+J5vgC6azExEx3T2vro0F+vosVv2eX3djvbVZ3ESzZjU6AHrwAAAAAAAAAAAAAAAAAAAAAAAAAAAAdmmz5dNqMeow2muTHaLVmPCYdY9idPJjftLMmybhi3TbMOtxdnXj2q/o2jvhWsb9Hm7/kW5ToM1uWDUzyrznsrfw+/u+5kh9Dxs3rY4n5fK8zj+hlmvx8ACwqgAAAAAAAAAAAAAAAAAAAAAAAAAAADhnxY82G+HLWL471mtqz4xLmB4Ye4g23JtW65tHfnNYnrY7T+dSe6f8A54wj2TeP9o/L9q/KsNeeo0sTaOXfanjH9fv82Mnz3Kw+lk18PquHyPXxRM+Y8gCstgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC/egXo/1HSR0k7fsEVyRoKT+Ubjlr2er09ZjrdvhNpmKx77R5LCegvoh9GvzD6Nse47jp5x75vkV1Oqi0e1ixcvosXu5RM2mO/naYnuhDnyenX90mKnezMei0un0WjwaPSYaYdPgx1xYsdI5VpSscorEeUREQ7gZS+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAALC6eukDT9G/Rvr9/m1J194/J9uxW/vNRaJ6vZ4xWIm0+6sr9efPpddJUce9JGTQbdqPWbHsc20ulmtudc2Tn9Lljz5zEVie7q1ifGU2DH6lv2R5b9KsO63VajW6zPrNXmvm1GfJbLlyXnna97Tzm0z5zMzLpBqqAAAAAAAy36K/RtPSJ0lYPy7Tzk2LaZrq9wmY9nJyn6PDP78x2x+jWzE+DFlz5qYMGO+XLktFKUpWZta0zyiIiO+Zekfo59HWLo26NNHtWbHWN21XLVbneOUzOa0R7HPypHKsfCZ8UHIydK+3mUuGnazJERERyjsgBlrwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAx96QPSFh6NujXX75FqzuOaPyXbcc/nai8T1Z5eMViJtPnFeXjDILz09LTpJjpA6Ssmm2/P6zY9l62l0XVtzrlvz+lzR+9MRET41pWfFNgx97fsjy361Yg1WfNqtTl1Opy3zZ815yZMl552vaZ5zMz4zMusGqoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKDfL9XSRX9K0IRKb9f28WPyiZRbM5M7ySvYY1QAV0oACb2S/W0c1/RtMK9EbDf6TLj84if/AJ96XavHtvHChljV5AEyMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArM1mJiZiY7YmPBlrhLdo3bZ8eW0/T4/YzR+1Hj9vf97Eqb4M3b5K3itsluWnzcseXyjyt9k/y5rfDz+lk9/EqPP4/rYvbzHhlYI7Y5wN98wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAT2xylinjPafkrd7Rjry0+bnfF5R51+yf5cmVkRxbtMbts+TDWI9fj9vDP7UeH29yry8Hq4/bzC7weR6GX38T5YlC0TWZiYmJjsmJ8B8++oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdmk0+fV6rFpdLhvmz5r1x4sdK87XtM8oiI8ZmZ5AzD6JPRr8/uknHrNw085Nj2Xq6rWdaPZy5Of0WKfjMTMx+jWY8YehLH/AEAdHuDo26NdBsU0pO45Y/KdyyRPPr6i0R1o5+MViIpHurz75lkBlZ8nqW/ZfxU61AEKQAAAAAAAAAAAAAAAAAAAAAAAAAAAAB1azU6fR6TNq9Vmx4NPgx2yZcuS3VrSlY5zaZnuiIjnzBh70t+kr5hdG2XQ7dqYx77vcW0uk6s+1ix8vpcvu5RPKJ/StE+Dz3X90+dIOfpJ6Sdfv3WyRt9J/J9txW7PV6esz1Z5eE27bT77THgsFq4Mfp1/dQy37WAEyMAAAABIcObPuHEO/wCh2PasE59drs9MGDHHja08o5+UR3zPhETIM8+hH0a/OXjS/Gu6afrbVsV4/JotHs5tZy51+Pq45Wn3zT3t5Vs9FvB238BcCbZwvt0RamkxfS5eXKc2We2+SfjaZ+Eco8FzMnNk9S21/HTpXQAiSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOnXarTaHRZ9brM1MGm0+O2XNlvPKtKVjna0z4RERMgw16X3ST8xeji+2bdqOpve+xbTafqz7WLFy+ly+7lExWPfbnHdLz8X3078f6npI6SNw4hvN66GJ/J9uxW/u9PSZ6vZ4TPObT77SsRq4Mfp118qGW/ewAmRgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIHeL9bXWj9GIhRuzUX9ZqMl/0rTLrY+S3a0y0axqsQAOHQACr2m/U11PK3OE+tjFf1eWl4/NtErmiecc4aHDt+GYVORHvEvoC2rgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMmcAbv+X7V+SZrc9RpYivbPbanhP8AT7vNcrDvD+5ZNq3XDrKc5rWeWSsfnVnvj/54xDL+DLjzYaZsVovjvWLVtHjEt3hZ/UpqfMPmvtHj+lk7R4lzAXWeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxv0h7R+R7jGvw15YNTPtcu6t/H7+/71rMy73t+LdNszaLLyjr19m36No7p+9h7VYMum1OTT5qzTJjtNbRPhMMPnYPTv2jxL6T7N5Hq4+s+Y/p1gKLRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGyfoOdGvy9xXm483TTzbbtmv1NDFo7MurmOfW9/UrMT8bV8pa/8ACmxblxPxJt/D+0YJza7X564MNPDnM98z4REc5mfCImXp10ccJ7bwNwTtnC+1R/0+hwxSckxynLkntvkn32tMz7ufLuVuTk616x5lNgp2ncrhAZq6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAANavTl6SvkThbDwDtWpmu4bxT1mvmk9uPSxP1Z8pyWjl+7W0T3tgOL9/wBu4W4Y3HiLd83qtFt+C2fLbxmIjsrHnaZ5REeMzEPMXpE4r3LjfjPc+J91vM6jXZpvFOfOMVO6mOPdWsREfBZ42PtbtPiEGe/WNQgAGkpgAAAAADbf0EOjXl+U9Je7afv6+l2iLx9mXNH88cT/AOZ7mt/RbwbuHH3He2cL7dE1vq8v02XlzjDijtvkn4V5/GeUeL044c2fb+H9h0Ox7Tp66fQ6HBXBgxx4VrHKOfnPjM+M85VeVk616x8p8FNz2lXgM5cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGsvpz9JPyPw3g6PtrzzXXbrSM24Wpbtx6aJ7KfG9o/01mJ7LNg+M+Itt4T4V3LiTeMvqtDt+C2bLMcuduXdWvPvtaZisR4zMPMXj/ijcuNOMtz4n3a3PVa/POSa9aZjHXupjjn+bWsRWPdC1xcfa3afEIM9+saQQDRUwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB1aq/q9Nkv5Vnk7VFvV+ropr+naI/r/Rxkt1rMuqRu0QggGO0QAAABcegv6zR4rfs8p+zsW4mdiv1tNfH41t/KVriW1fSDkRuu0iA0VMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAX90bbv63Bfac1vbxxN8MzPfXxj7O/7fcsF37fqs2h1uHV4LcsmK0Wj3+74T3J+PmnFeLK/KwRnxzX+GahT7ZrMO4aDDrME+xlrz5eU+MfZPYqH0UTExuHycxNZ1IA9eAAAAAAAAAAAAAAAAAAAAAAAAAAAAC0uPOHp1uOdy0VOeppX6SkR25Kx4x74/nC7RHlxVy162S4M1sN4vVg4ZI4p4Sw7ja2r0E1waqe21Z+pkn+k+/8A/qsDcNBrNvzzh1mnvhv4daOyfhPdLBz8a+Gffx9X03H5ePPH4Z9/opgFdaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXb0Q8E67pC6QNs4X0XXpXUZOtqs1Y5+owV7cl/Lsjsjn3zMR4vJmIjckRudNlPQR6NvyfRanpJ3XT/S6iLaXaYvH1ccTyy5Y+Mx1Inyi/m2tUeybZodl2fR7Rtmnpp9Fo8NMGDFXupSscoj7oVjIyXm9ttGlesaAHDoAAAAAAAAAAAAAAAAAAAAAAAAAAAABaHTFxxoujvo+3LifWdW+TDT1ekwzP9tnt2Up8OfbPlETPg9iJmdQ8mdRtrV6dvSV+V7jp+jbatRzw6Sa6rdbVnstlmOePFP7sT15ju52r41aqqveNx1u8btq913LUX1Ot1ma+fPlv33vaZm0z9sqRr46RSumfe3adgDtyAAAAAyR6OXR1k6SekvR7Vnx3+SdJy1W53js5Yaz9Tn53nlXz5TM+Dy1orG5exG51DZ70I+jWOGeCr8abpp+ruu+0idPFq+1h0nPnX/XMRf4RT3tiHHDjx4cVMOHHTHjpWK0pWOUViOyIiPCHJkXvN7TaWhWsVjUADh0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAs7pn460fR10eblxNqupfNip6rRYbT/b6i3OMdPhz7Z5dvVrafB7ETM6h5M6jbWj07Okr8u3XTdHG1ajnp9Faup3S1Ldl80xzx4p5eFYnrTHnavjVqyqd23DWbtumq3TcdRfU6zV5r58+W887XvaZm1p+MzKma+OkUrEQz727TsAduQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABE79f28WPyibSllv7rfr67J5V9mPsVuVbWPX1TYI3dSgM1dAAAAEhseTq6q1J/Pr/ADj/AOSj3do8nqtVjv4Rbt+DvFbreJc3jdZhcgDYZwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC8Ojfd/Uau215rfR5p62KZnuv4x9sfzj3sgsIYr3xZK5Mdprekxato74mO6WXuG9zpu204tXHKMn1ctY8LR3/AI/a2Ps/P2r6c/DB+1OP1t6tfE+UiA0mQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOvU6fBqcU4tRhx5sc99b1iY/m7B5MbexOveFua3gvZdRM2x0zaaZ//Tv2fdPNHW4A0/W9ncssR5Tiif6r0EFuJht5qs15vIrGossr5gYf1nk/gx+J8wMP6zyfwY/Feo5+5YP0/wBuv8hyP1f0sr5gYf1nk/gx+J8wMP6zyfwY/FeofcsH6f7P8hyP1f0sr5gYf1nk/gx+J8wMP6zyfwY/FeofcsH6f7P8hyP1f0sr5gYf1nk/gx+J8wMP6zyfwY/FeofcsH6f7P8AIcj9X9LK+YGH9Z5P4MfifMDD+s8n8GPxXqH3LB+n+z/Icj9X9LK+YGH9Z5P4MfifMDD+s8n8GPxXqH3LB+n+z/Icj9X9LK+YGH9Z5P4MfifMDD+s8n8GPxXqH3LB+n+z/Icj9X9LK+YGH9Z5P4MfifMDD+s8n8GPxXqH3LB+n+z/ACHI/V/SyvmBh/WeT+DH4nzAw/rPJ/Bj8V6h9ywfp/s/yHI/V/SyvmBh/WeT+DH4nzAw/rPJ/Bj8V6h9ywfp/s/yHI/V/SyvmBh/WeT+DH4nzAw/rPJ/Bj8V6h9ywfp/s/yHI/V/SyvmBh/WeT+DH4nzAw/rPJ/Bj8V6h9ywfp/s/wAhyP1f0sr5gYf1nk/gx+J8wMP6zyfwY/FeofcsH6f7P8hyP1f0sr5gYf1nk/gx+J8wMP6zyfwY/FeofcsH6f7P8hyP1f0sr5gYf1nk/gx+J8wMP6zyfwY/FeofcsH6f7P8hyP1f0si/R/Tl7G6Wiffg5//AOyP1vA264om2ny6fUx4RFurafv7P5sjjm3Bwz8ad1+0uRXzO/8AxhbXaLV6HL6rV6fJhv4RevLn8PNTs2avTafV4Zw6nDTNjnvrevOFh8UcHX0tb6vaotkwx22wz22rHu84/n8VDPwLY43X3hp8b7Splnrf2n/9LPAUGmAAAAAAAAN4fQV4Ex7LwDqONNXi/wCv3280wTMdtNNjtMRy8uteLTPnFaNIdPhyajUY9PhpN8uW8UpWPGZnlEPVfhDZsHDvCu1bBpYrGHbtHi0tOUcucUpFef28uf2qvLvqsR9U/Hru20oAzlwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaGemj0k/O/pB+bO25+vs/D97YZms+zm1Xdkt74ry6kfC0x2WbP+k/0kR0c9Gep1GjzdTetz62k22In2qXmPay/5K9v701jxectpm1ptaZmZnnMz4rvEx/nlW5F/ywALyqAAAAAAPQf0PeBcfB/RFo9w1GCK7pv0V1+otMe1GOY+hp8IpPW5eE3s0P4J2a3EXGWy7BXnE7jr8Gl5x4RkyRWZ+znzeqmDFiwYMeDDSuPFjrFKUrHKK1iOURCny76iKrHHr7zLmAoLYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0I9MzpJ+eXSF83dtzxfZtgtbDWaW51zamezJf3xHLqR8LTH1m0HpSdJMdHXRpqMmjzRTe9162k26In2qTMe3l/wAlZ5/vTXzedFpm1ptaZmZnnMz4rvEx/nlWz3/LAAvKoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD5e0VpNp7ojnK2L2m97Wnvmecp7dMnq9Dk87ezH2rfUOZb3iFvjx7TIAprAAAAAAC5dJk9bpseTxmsc/i7UfseTraa2Pxpb+U/8AyUg2Mdu1IlnXjraYAHbkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXFwHu/ydu0YMtuWn1MxS3OeytvzZ/p9q3R3jyTjtFo+EeXHGWk0t8s4iB4I3f5U2itctuep0/KmTnPbaPC32/wDMSnn0mO8XrFo+XyOXHbHeaW8wAO3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACwuP+Hq4Otu2ixxGOZ+npWOysz+dH9Vls35sdM2K+LLWL0vWa2rPdMT3wxBxDtt9p3XLpLc5pE9bHafzqz3T/T7GNz+PFJ718S+g+zOVOSvp28x/SPAZzVAAAAAAXB0a46ZukXhnFkr1qX3fS1tHnE5q83qc8ouFtwjaOJtq3We7Ra3DqO79C8W/o9XKWrelb0tFq2jnW0TziY81HmeYWuN4l9AUlkAAAAAAAAAAAAAAAAAAAAAAAAAAAAccl6Y8dsmS9aUrE2ta08oiI75mXJr76a/SV81eBa8IbZn6u7b/S1Ms1ntw6TuvP8Ann2I846/jDqlJvaIhza0VjctYPSV6Rr9JHSXq9fpstrbPoeek2yvhOOs9uTl53nnbz5dWPBjIGxWsVjUM+ZmZ3IA9eAAAAAAMh+jZSmTp34PresWiNypblPnETMT98PSt5h9B2502fpi4R3DLaKYse76euS091aWvFbT9kWl6eKHM/2hb4/iQBTWAAAAAAAAAAAAAAAAAAAAAAAAAAAABxy5MeLFfLlvXHjpWbWtaeUViO+Znwhya9emz0k/NfgenB22ajq7tv1JjNNZ9rDpO68/559iPdF/J3Sk3tFYc2tFY3LWH0kekbJ0kdJms3LT5bTtGj56TbKT2R6qs9uTl53nnbz5TWPBjQGvWsVjUM+ZmZ3IA9eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIvfsnZixR77T/AE/qiVXu2T1muv5V9mFIyc9u2SZX8UapAAiSAAAAAAK/ZMnV1c08L15fbH/yU2tnT5PVZ6ZP0bRK5YnnHOGjxLbrMfRT5FdW2+gLSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABK8LbrbaN3x6iZn1NvYzRHjWfH7O9lulq3rFqzFqzHOJjumGD2Rejnd/yrQTtua3PNpo505z9an/bu+HJp/Z+fU+nPz4Y/wBqcftX1a/HldgDXYQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAtvj7aPlDap1OGvPUaaJtHLvtTxj+v2e9cg4yY4yVms/KTDlnFeL1+GDhOcabR8lbvb1deWmz874vKPOv2f8ckG+bvSaWms/D67HkjJSL18SAOHYAAAA9KPRr4tx8Y9DOwbjOaMmq02njQ6zt52jNhiKTNvfaIrf/PDzXbCehL0kRwtx1k4R3PP1Nr3+1a4ZtPZi1cdlJ/zx7E+/qeSvyadqe3wlw262b1AMxeAAAAAAAAAAAAAAAAAAAAAAAAAAAAUW/wC66DYtk1u87pqK6fRaLBfPnyW7q0rHOft93i8yOlrjTXdIHH258Ua7rUjVZOWnwzPP1GGvZSkfCO/l3zMz4tk/Tv6SvVYNN0abVqPbydTVbvNLd1e/Fhn4z7cxPlj82oTQ4uPUdp+VPPfc9YAFtAAAAAAAAA5Ysl8WWmXHeaXpaLVtE8piY7peo3RVxTg416O9j4nw2rM67SVvmivLlTNHs5K/ZeLR9jy3bS+gl0kxoN31PRzumeI02utbU7Za9vq5oj28f+asdaI86z42VuVj7V3HwmwW1bX1bkgM1dAAAAAAAAAAAAAAAAAAAAAAAAAAAAUPEG7aDYdj1u9bpqK6fQ6HBfPnyT+bSsc5+M+7xeY/Stxnr+P+Pd04p3CJpbV5focPPnGHDXsx44+FYjnPjPOfFsl6d/SV1Men6NNrz+1fqard5rPdH1sWKf5Xn/I1FaHFx9Y7T8qee+56wALaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcclopjtee6sTMuSj3jJ6vRWjxvPVc3t1rMvaxuYhBXtNrzae+Z5y+AxmkAAAAAAAALh23J63RY58Yjqz9i3krsOT+0wzP7Uf1/os8W2r6+qHPXddpUBpKQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAq9o12Xbdxw63D9bHbnMc/rR4x9sKQexM1ncPLVi0TEs2aPUYtXpcWpwW62PLWLVn3S7Vi9Gu78rX2jPbsnnfBznx/Or/X719Po8GWMtIs+S5OCcGSaSAJkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJ4s2qN32jJhrEevp7eGf2o8Pt7mJbRNbTW0TExPKYnwZwY46RNo/I9xjcMNeWHUz7XLurfx+/v+9mfaGDcepH/AK2Psvkan0rfPhaoDIboAAAA5YsmTFlplxXtjyUtFq2rPKazHdMT4S4gPST0b+kWnSR0Z6Pc8+SJ3fR8tJudPH11Yj6Tl5Xjlby5zMeDJTzq9FjpI/8ADvpMwX12ecex7r1dJuPOfZpEz7GWf3LT2/szZ6KxMTHOO2GXnx9LfsvYr9qgCBKAAAAAAAAAAAAAAAAAAAAAAAALc6TOLtu4F4H3TijcpicWiwzamLrcpzZJ7KY499rTEe7v8FxtH/Tg6SfnDxjj4G2vUdbbdkvM6uaz2ZdXMcpj/wBOJ6v7038kuHH6ltOMl+ldsBcT73uPEnEWv37ds3rtdr898+e/h1rTz5RHhEd0R4REQjga3hngAAAAAAAAACp2rX6zatz0u57fnvp9ZpM1c2DLSeU0vWYmsx8JhTAPTzoY460fSL0d7bxNpvV0z5aeq1uCk8/UaivZenw7pjn+bas+K8mhHoZ9JXzN6Qo4d3LP1Nm3+1MNptPs4dT3Yr+6J59SfjWZ+q33ZWbH6dtfC/iv3rsAQpAAAAAAAAAAAAAAAAAAAAAAAABbfSdxht/AfA26cU7lyti0WHnjxc+U5ss9lMce+1piOfhHOe6FyNHfTf6So4j4xxcEbXqOttmx3mdVNZ7MurmOU/w4ma/G1/clw4/Utpxkv0rtgPiXedw4i4g1++7tnnPrtfntnz37udrTznlHhEd0R4REQjwa3hngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH33JzzUxR+bHOfjKYW3rMnrtVkyc+yZ7Ph4KvLtqmvqn49d226QGcuAAAAAAAACo27J6rWY7eEz1Z+1Tj2s9ZiXkxuNLqHVpMvrtNjyeMx2/HxdrZidxtmzGp0APQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB2abPl02ox6jDaa5MdotWY8JhmDZNwxbptmHW4uzrx7Vf0bR3ww2uno83f8AItynQZrcsGpnlXnPZW/h9/d9y9wc/p36z4lnfaPH9XH2jzDJADcfNgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACj3rb8W57bm0WXsi9fZt+jbwn71YPLRFo1L2tprMTHlhLV4Mul1OTT5q9XJjtNbR74da+OkraO2m74K+VM/L/APG39PuWO+cz4pxXmsvreNnjPji8ACFOAAAAN+/Q36SY406Oq7DuOo6+9bBWuDJNp9rNp+7Fk98xEdWffWJn6zQRevQjx7q+jjpF27iTB6y+lrb1Ovw1n+209uXXry8ZjstH7Vaos+P1K6+UmK/Wz05FPtut0m5bdptx0Gox6jSarFXNgzUnnXJS0RNbRPlMTEqhkr4AAAAAAAAAAAAAAAAAAAAAAADHfpDdIeLo26NNdvWO9J3TP/0u2Y7dvWz2ieVuXjFI52nz5cvGHmxqM2bUajJqNRlvlzZbzfJe887WtM85mZ8ZmWXPSu6Sv/ELpKy49Bn9Zsez9bS6Dqz7OSef0mX/ADTEcv2a1YganHx9K+/mVHNftYATogAAAAAAAAAAACszW0WrMxMTziY8Hot6LfSRHSL0Z6fJrc8X3vaurpNxiZ9q8xHsZf8APWP9UW8nnSyX6N3SNk6N+kzR7lqMto2jWctJudI7Y9VaezJy86Tyt58otHihz4+9f3SYr9bPSMccWTHlxUy4r1yY71i1bVnnFonumJ8YcmUvgAAAAAAAAAAAAAAAAAAAAAAEzERznsgGOfSI6RMXRt0aa3eMWSnyrqf+l2zHbt62e0T7XLxikc7T4dkR4w82s+bLqM+TPnyXy5clpve9552taZ5zMz4zzZb9KzpJnpC6Ss1NDn6+x7PNtJoOrPs5J5/SZv8ANMRy/ZrX3sQtTj4+lffzKjmv2sAJ0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADo1+T1WkyX8eXKPjK3Etv2Xsx4Y8fan+n9USzeVbd9fRdwV1XYArJgAAAAAAAAAExsWXnivinvrPOPhKSW/teX1WtpMz2W9mftXA0+NftTX0Us9dWAFhCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFZmsxMTMTHbEx4ADLXCW7Ru2z48tp+nx+xmj9qPH7e/wC9LsU8Gbt8lbxW2S3LT5uWPL5R5W+yf5c2Vo7Y5w+g4mf1cfv5h8vzuP6GX28T4AFpSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdWr0+LVaXJps9etjyVmto90sPbzoMu2blm0WXtnHbst+lXwn7mZlqdIu0fle3xuOGvPNpo9vl32p/27/vUedg9SnaPMNH7N5HpZOk+J/tjkBhvpAAAAAAG5/oK9JPypsOo6O911HPWbbWc+22vPbk08z7WP40tPOPdbyq2feVnAfE25cG8YbZxNtN+rq9vzxlrEzyi9e61J91qzNZ90y9O+CeI9t4u4T23iXacnrNFuGCM2PzrPdas++toms++JZ3Kx9bdo+VzBftGpTACqnAAAAAAAAAAAAAAAAAAAAGD/TE6So4I6Ob7Lt2o6m979W2nw9Wfaw4OXLLk93ZPVju7bc4+rLNO46zS7dt+o3DXZ6afS6bFbNmy3nlWlKxztafdERLzP6cePdV0j9I+48R5pvXSTb1Ggw2/utPWZ6kfGec2n32lY4+Pvbc+IQ5r9a6WQA01IAAAAAAAAAAAAAAABvT6E3SVPFHBF+Dtzz9bddhpEYJtb2s2k58qz/knlSfdNPNsK8ueinjPX8Ace7XxTt8Te2ky/TYefKM2G3Zkxz8azPKfCeU+D044f3bQb9sei3ra9RXUaHXYKZ8GSPzqWjnHwn3eDN5OPpbceJXcN+0aVwCsmAAAAAAAAAAAAAAAAAAAAGDvTF6SfmT0dW2XbdR1N736ttPims+1hwd2XJ7p5TFY99pmPqs07lrdJtu3ancdfqMen0mlxWzZ8155Vx0rEza0z5RETLzQ6cOPdV0j9I248SZpvTS2t6nQYbf3OnrM9SPjPObT+1aVjjY+9tz4hDmv1rpZADTUgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHTrMvqdNkyeMR2fHweTOo3JEbnSD3HL63WZLc+yJ6sfYpwY1p7TMy0ojUaAHj0AAAAAAAAAAieU84XLpcsZtPTJ+lHb8fFbSX2LLzx3wzP1Z60fBa4l9X19UGeu67SYDRUwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABkzgDd/wAv2r8kzW56jSxFe2e21PCf6fd5sZq/h/csm1brh1lOc1rPLJWPzqz3x/8APGIWeLm9LJv4VOZx/XxTEefhmIcMGXHmw0zYrRfHesWraPGJc30L5XwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPlq1tWa2iJrMcpifGH0BiTivarbRu+TBET6m/t4Z/Znw+zuRLKnGu0fKm0WnHXnqcHO+Lznzr9v/MQxW+f5eD0snt4l9RweR6+L38x5AFVdAAAAG0noJdJMbfvGp6Od1z8tNr7W1O2WtPZTPEfSY/8ANWOtHvrPjZq2qdq1+s2rc9Lue3576fWaTNXNgy0nlNL1mJrMfCYcZKRes1l1S3WdvWUWb0McdaPpF6O9t4m03q6Z8tPVa3BSefqNRXsvT4d0xz/NtWfFeTImJidS0IncbgAePQAAAAAAAAAAAAAAAAENxxxJtnB/CW5cS7vl9Xo9vwTlv29t57q0r+1a0xWPfMERv2PDXn06ukn5L2HT9He1ajlrNyrGfcrUntx6eJ9nH8b2jnPur5WaYJrjniXc+MeLty4m3fJ19ZuGect4j6tI7q0r+zWsRWPdEIVr4sfp10z8l+9tgCRwAAAAAAAAAAAAAAAANuvQQ6Suvj1HRpumf2qdfVbRNp74+tlxR/O8f52oqQ4a3ncOHeINBvu055wa7QZ658F+/las845x4xPdMeMTMOMtIvXTqluttvV4W30Y8Ybfx5wNtfFO28q4tbh55MXPnOHLHZfHPvraJjn4xynulcjImJidS0YnfuAPAAAAAAAAAAAAAAAAABC8c8S7bwfwlufE275Opo9vwWy3iJiJvPdWlef51rTFY98wRG/Y8NevTp6SvkzYtP0d7TqYjV7jWM+5zSe3Hp4n2Mc+U3tHOY/Rr5WaYJrjniXc+MeLty4m3fJ19ZuGect4j6tI7q0r+zWsRWPdEIVr4sfp10z8l+9tgCRwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIvfcvKuPDHj7U/0Si3dwy+u1eS8Tzjnyj4Qrcq/WmvqmwV3banAZq6AAAAAAAAAAAAKjbsvqdXS0z2TPKfhKnHtZ6zuHkxuNLqHRoM3rtJS8z28uVvjDvbNZi0bhnTGp0APXgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC/ujbd/W4L7Tmt7eOJvhmZ76+MfZ3/AG+5ebCu36rNodbh1eC3LJitFo9/u+E9zMW2azDuGgw6zBPsZa8+XlPjH2T2NvgZ+9Ok+Y/p879p8f07+pHif7VAC+zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjHj3aPk7dp1GKvLT6nnavLurb86P6/b7mTkdxHtlN22nLpLcovy62K0/m3ju/D7VblYfVx6+Vvhcj0MsTPifLD45Zcd8WW+LJWa3paa2rPfEx3w4vnn1QAAAAADPPoY9JPzO6Qfm3uWea7Pv8AeuHna3s4dT3Y7+6Lc+pPxrM/Vb6vJGszW0WrMxMTziY8Ho16MHSRHSN0Z6bUazN1962zq6TcomfaveI9nL/nr2/vRaPBR5eP88LXHv8AlllQBSWQAAAAAAAAAAAAAAABpj6dXSV8pb5g6Otq1HPSbdaufc7UnsvnmPYx848KVnnMfpW86tmOm7j3SdHHR1uPEmfqX1Va+p0GG399qLRPUr8I5Taf2ay8z9y1ur3LcdTuOv1GTUavVZbZs+bJPO2S9pmbWmfOZmZW+Lj3PaVfPfUdYU4DQVAAAAAAAAAAAAAAAAAAAAGxnoQdJPzd4yycD7nn6u2b5kidLNp7MWr5coj/ANSIivxinvbxPJTBmy6fPjz4Ml8WXHaL0vSeVq2iecTE+E83pL6O/SJi6SejTRbxlyU+VdN/0u5469nVz1iPa5eEXjlaPDtmPCVDl49T3hawX3HWWRgFNZAAAAAAAAAAAAAAAAGmPp1dJXynvmDo62rUc9Jt1o1G5WpbsyaiY9jH2d8UrPOY/St51bMdN3Huk6OOjrceJM/Uvqq19ToMNv77UWiepX4Rym0/s1l5n7lrdXuW46ncdfqMmo1eqy2zZ82Sedsl7TM2tM+czMyt8XHue0q+e+o6wpwGgqAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOjX5fU6S94nt5co+MrcSe+5ed6YYnu9qUYzeVftfX0XcFdV2AKyYAAAAAAAAAAAAABJ7Fm5ZL4Znst7UfFLrZ0+ScOemSPzZ5rlrMWrFqzziY5xLR4t916/RTz11bb6AtIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABeHRvu/qNXba81vo809bFMz3X8Y+2P5x71nuWK98WSuTHaa3pMWraO+JjulLhyzivFoQ58MZsc0lm8R3De503bacWrjlGT6uWseFo7/x+1Ivo62i0RaHyV6TS01nzAA6cgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMf9JG0ep1Nd1w1+jzT1c3Lwv4T9sf8e9ZzNO5aPDr9Dm0eeOePLXqz7vKfsntYe3HSZtDrs2kzxyyYrTWff5T9rE5+DpfvHiX0X2ZyPUx9J8x/SnAUGmAAAAMn+jR0j26N+kzSa/VZZrs2v5aTc6+EY7T2ZOXnS3K3ny60R3sYDy1YtGpexMxO4ettLVvSt6Wi1bRzraJ5xMeb6wB6FfST87OAp4U3PUdfd9gpXHSbT7WbS92O3v6v1J93U82f2Pek0tMS0K2i0bgAcugAAAAAAAAAAAAGIvSs6SY6PejTNXQ5+pvm8dbSaDlPtY45fSZo/drMcp/StV1Ws2nUPLTFY3LWD0xekr57dIltk23UzfZNhtbBi6s+zm1HPllye+ImOrE+VZmPrMGkzMzzmecjXpWKViIZ1rTadyAOngAAAAAAAAAAAAAAAAAAAAy96KXSTPR70l4aa/Uer2PeOrpdf1p9nHPP6PL/ltM8/2bW9zEI5tWLRqXtZms7h63RMTHOO2Bg/0O+kr579HNdl3LURfe9hrXT5etPtZsHLliye+eUTWffXnP1oZwZF6zS2paNbRaNwAOXoAAAAAAAAAAAADEXpV9JP8A4edGuaug1Hq993fraTb+rPK2OOX0maP3ImOU/pWq6rWbTqHlpisblrB6YvSV89ukS2ybbqZvsmw2tgxdWfZzajnyy5PfETHVifKszH1mDSZmZ5zPORr0rFKxEM61ptO5AHTwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfJmIiZmeUR2y+qLeM3qtJNYn2sns/Z4ub261mXta9p0htTlnNnvkn86ez4OsGPM7nctKI0APAAAAAAAAAAAAAAATmzZvWaXqTPtY55fZ4INV7Tm9Tq6xM8q39mf6JuPfpeEWWvaqfAaqiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAuLgPd/k7dowZbctPqZiluc9lbfmz/T7WT2DmU+CN3+VNorXLbnqdPypk5z22jwt9v8AzEtX7Pz/APHP/jE+1eP/AMtf/U8A1WKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALN6Sdo9bp67rgr7eL2c3Lxr4T9k/wDPuXk45sdM2K+LLWL0vWa2rPdMT3wizYoy0mspuPmnDki8MICQ4h22+07rl0luc0ietjtP51Z7p/p9iPfOWrNZmJfW0tF6xaPEgDl0AAAAu7of4313R50g7ZxRo+vemnydTVYaz/b4LdmSnlz5dsc+60Vnwemuy7lod52jSbttuopqdFrMNc+DLSey9LRziful5ONxPQR6Sfyvb9T0bbrqOebSxbVbVN5+timeeTFH7sz14jv5Wt4VVOVj3HaPhYwX1PWW1QDPWwAAAAAAAAAAAHDPlxafBkz58lMWLHWb3veeVa1iOczM+Ecnm16RPSJl6SekvW7xiyX+StN/0u2Y7dnVwVmfa5eE3nnafHtiPCGznpv9JU8OcHYuCNr1HU3PfKTOqms+1i0kTyn+JMTX4Vv7mjq/xceo7yqZ77nrAAuK4AAAAAAAAAAAAAAAAAAAAAAAC9+g/j3VdHHSNt3EmGb30tbep1+Gv99p7THXj4xyi0ftVh6YbdrNLuO36fcNDnpqNLqcVc2HLSedb0tHOto90xMPJhuf6CvST8qbDqOjvddRz1m21nPttrz25NPM+1j+NLTzj3W8qqnKx7jtCxgvqestnwGetgAAAAAAAAAAAOGfLi0+DJnz5KYsWOs3ve88q1rEc5mZ8I5PNr0iukTL0k9Jet3fFkv8lab/AKXbMc9nLDWZ9vl53nnafjEeENnfTe6Svm3wbj4I2vP1d03ykzqZrPbi0kTyn/XMTX4Rf3NHF/i49R3lUz33PWABcVwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBbxm9bq5pE+zj9n7fFMarLGHT3yz4R2fFbczMzMzPOZ71Pl31EVWOPX37PgCgtgAAAAAAAAAAAAAAAAALj0Wb1+mpk8eXK3xd6H2PN1ctsEz2W7Y+P/z/AITDWw370iWfkr1toASuAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABK8LbrbaN3x6iZn1NvYzRHjWfH7O9FDqlppaLR8OL0i9ZrbxLOFLVvWLVmLVmOcTHdMPq0+jnd/yrQTtua3PNpo505z9an/bu+HJdj6TFkjLSLQ+Sz4Zw5JpPwAJEQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC2+Pto+UNqnU4a89Rpom0cu+1PGP6/Z72MmcWKuNNo+St3t6uvLTZ+d8XlHnX7P8AjkyftDB/yR/62/srkbj0rf8AiDAZbaAAAAErwfxBuXCvE+3cRbRl9Vrtvz1zYp8JmO+s+cTHOJjxiZRQTGx6odHvFO3ca8F7XxRtVuem1+CMnV585x37r0n31tFqz8E80p9BjpJ+RuJc/R/umeK6Hdrzm0FrT2Y9VEdtPhesffWIj6zdZk5cfp200Md+9dgCJ2AAAAAAAAI7ibetv4c4e1++7rm9TodBgvnz38YrWOc8o8ZnuiPGZiEi1E9O/pJjJk03RrtWf2aTTVbtNLd89+LDPw7LzH7nkkxUm9tOL26121w6TuMNw48453Tincudcutzc8eLnzjDijspjj3VrERz8Z5z3ytsGvEREahnzO/cAAAAAAAAAAAAAAAAAAAAAAAAAATXAvE25cHcX7ZxNtOTqazb88ZaRM8ovHdalv2bVmaz7plChMb9jw9VeB+JNs4w4S23iXaMvrNHuGCMtO3tpPdalv2q2iaz74lMtMvQV6Svk3fNR0dbtqYrpNwtOfbJvPZTURHt4+fhF6xziPOvnZuayMuP07aaGO/euwBG7AAAAAAAAEfxLvO38O8P6/fd2zxg0OgwXz579/KtY5zyjxme6I8ZmISDUb07+kqbZNN0abVqOyvU1W7zWe+e/Fhn+V5+NPekxUm9tOL26121v6T+MNw48463TincpmMmszTOLFz5xhxR2Uxx7q1iI988575W0DWiIiNQz5nfuAPQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8vaK1m1p5REc5BFb7m7aYInu9q39EW7NRlnNnvln86ebrZGW/e8y0MdetdACN2AAAAAAAAAAAAAAAAAA5Yr2x5K5K99Z5wuXFeuTFXJXutHOFsJfY8/WpbBae2vbX4LfEvq3X6oM9dxtJgNBTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVe0a7Ltu44dbh+tjtzmOf1o8Y+2GYdHqMWr0uLU4LdbHlrFqz7pYTXv0a7vytfaM9uyed8HOfH86v9fvaHAz9LdJ8T/bL+0+P3p6keY/pfQDafPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJ4s2qN32jJhrEevp7eGf2o8Pt7ksOb0i9ZrPy7x3nHaLV8wwfaJraa2iYmJ5TE+D4urpE2j8j3GNww15YdTPtcu6t/H7+/71qvm8uOcd5rL63DljNSLx8gCNKAAAA7tDqtTodbg1ujzXwanT5K5cOWk8rUvWedbRPhMTES9Lugnj/TdJHRvt/EVJx11sR6jcMNJ/stRSI60cvCJ5xaI8rQ8y2bfQ+6SfmP0j02ncc802TfrV02frW5Vw5ufLFl8ojnPVmfK3P81X5GPvXceYS4b9bPQEBmLwAAAAAAAC1ulfjPQcAcBbpxRr+raNLi5YMMzynPmt2Y8cfG3Ln5RznweZHEG7a/ft81u9bpqLajXa7PfPnyT+de085+Ee7wZ29NnpJ+dHHNOD9szzbadhvNc01t7ObVzHK8+/qR7EeU9fza9tLjY+ldz5lSzX7W0ALKEAAAAAAAAAAAAAAAAAAAAAAAAAAABUbZrtXtm5abcdBqL6fV6XLXNgy0nlbHesxNbR74mIl6Y9CXHmk6RujrbuJME466m9fU6/DT+51FYjr15eET2Wj9m0PMZnP0Oekr5ldIddi3LUdTZN+tXBkm0+zh1Hdiye6JmerM+UxM/VV+Tj713HmE2G/W2m/YDMXQAAAAAAAFr9KvGeg4A4C3TincOV66TF9DhmeU5809mPHHxtMc58I5z4PMfiDdtfv2+a7et0zzqNdrs98+fJP517Tzns8I7eyPCGePTa6SfnPxvXg3bM/W2rYckxnms9mXV8uVp/yRzp8Zu15aXGx9a7nzKlmv2nQAsoQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABH71m6mnjFE+1fv+CQW7uGf1+qteJ9mOyvwV+TfrTX1TYa9rb+inAZi6AAAAAAAAAAAAAAAAAAAAO3S5pwaimWPCe33w6h7EzE7h5MbjS6azFqxas84mOcS+qDZc/rNPOK0+1j7vgr2xS8XrFoZ9q9Z0AOnIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7NNny6bUY9RhtNcmO0WrMeEw6x7E6eTG/aWZNj3DFum2YdZi5R149uvP6to74VrF/BG+fJWvnBqL8tJnmIvz7qW8Lfj/ANmUImJjnE84fQcXPGam/n5fLczjTgya+J8ACyqAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKPetvxbntubRZeyL19m36NvCfvYe1eDLpdTk0+avVyY7TW0e+GbVjdJW0dtN3wV8qZ+X/42/p9zO5+DtXvHmGr9l8jpf058T/axwGM+gAAAAAAeh/oodJM9IPRphxa/P6zfNm6uk102nnbJHL6PLP71YmJn9KtmX3mt6O/SJl6NukvQ7zkvf5L1H/S7njjt54LTHO3LzpMRaPGeUx4y9JsGXFqMGPPgyUy4slYvS9J51tWY5xMT4xyZfIx9Le3iV7DftVzAQJQAAABjP0k+kanRv0Z6vcdPlrG8a3npNsp4+ttHbk5eVK87eXPqx4smWmK1m1piIiOczPg85/Si6SbdI3SXqM2jz9fY9r62k22ItzresT7eb/PaOfP9GKR4J8GPvb38Ist+tWK8uTJly3y5b2yZL2m1rWnnNpnvmZ8ZcQaiiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAETMTzieUgD0S9FXpJjpD6NMEa/Ues3zaOrpNw6087ZOUfR5p/frHbP6VbsuPNj0dOkXL0bdJWj3bNkv8AJOq/6Xc8cc554bTHt8vOk8rR8JjxekmDLiz4aZsOSmXFkrFqXpaJrasxziYmO+JZfIx9Le3iV7DftVzAQJQAAABjX0kOkWnRv0Z6zc8GSI3fWc9JtlPH11on6Tl5Ujnby5xEeLJVpitZtaYiIjnMz4POn0pekiekXpM1GTRZ5vsm1dbSbdET7N4ifby/57R/pivknwY+9vfwiy361Ypy5MmXLfLlvbJkvabWtaec2me+ZnxlxBqKIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACk3XP6nSzET7V/Zj+qAVe65/XaqYifZp7Mf1UjL5GTvf8A6XsNOtQBAlAAAAAAAAAAAAAAAAAAAAAAd+hzzp9TXJ+b3W+C447Y5wtVObPn9bpvV2n2sfZ9ngu8TJqekq3Ip7dlcAvKoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvjgTiWta49q3DJyiPZwZbT/8AjP8AT7vJY4lw5rYrdqoORgrnp1sziLE4Q4tjHWmg3bJ7Mezjzz4e634/f5r7rMWrFqzExMc4mPFv4c1c1d1fMcjj3wW62AEyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdWt0+LV6TLps1eePLSa2j3S7R5Mb9pexMxO4YS1WG+m1WXT5Pr4rzS3xieTrSHElq24g3Cad35Rf/8AdKPfMXjVph9jSZtWJkAcuwAAABvH6EPST85ODMnBO6ajrbpsVInTTafazaSZ5V/hzMV+E097Rxc3RdxjuHAXHe2cUbda030mWPXYonlGbFPZfHPxrM/CeU+CLNj9SuneO/S23qQI/hzeNv4h2DQ75tWeM+h12CmfBkjxraOcc/KY7pjwmJhIMloAAAKXd9w0e07Vq903HUU0+j0eG+fPlv3UpWJm1p+ERIMIemd0lfM/o+nhvbc/V3jf6Ww86z7WHTd2S/um3PqR8bT4NCl4dMvHOt6ROkPcuJ9V16Ys1/V6PDaf7DT15xjp8eXbPnabT4rPa2HH6ddKGS/e2wBKjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG8noRdJXzl4LycFbpqZvuuxUj8mm89uXR8+Vf4czFfhNPe0bXN0XcY7hwFx3tnFG3WtN9Jlj12KJ5RmxT2Xxz8azPwnlPgizY/Urp3jv0tt6kCP4b3nb+Idg0O+bVnjPoddgrnwXjxraOcc/KY7pjwmJSDJaAAACm3XX6Pats1W57hnpp9JpMNs2fLeeUUpWJm0z8IgGEfTM6Sfmb0eTw9tuo6m87/W2Cs1n2sOm7st/dM8+pHxtMfVaELy6aOO9Z0jdIe48Tanr0wZLeq0WG0/2Gnrz6lPj3zP7VrSs1rYcfp118qGW/ewAlRgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACm3HP6jS2tE+1b2a/FUoLd8/rtT1Kz7OPsj4+KHPk6USYqdrKIBlL4AAAAAAAAAAAAAAAAAAAAAAAAqNBn/J9TW8/Vnst8FOPa2ms7h5MbjUrqjtjnAodnz+t03q7T7WPs+zwVzYpaL1iYZ1q9Z0AOngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAneHOJtdtHLFP/UaXn/ZWn6v7s+H/CCHdL2pPaso8mOuSvW8bhl/Zd827dscTpc8es5duK/ZePs8fjCSYPpa1LxelpraJ5xMTymFx7TxluujiKaia6zFHhknlf8A1fjzamH7RifbJDGz/ZVo98U7/Zk0W1t/Gmz6iIjPOXSX/brzr98f15JzSbhodXEfk2swZufhTJEz9y/TNS/+sszJgyY/9qzCpASIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABR73r8e2bZn1mTl7FfZj9K3hH3vm67roNswzk1mopj7OynPna3wjvY14p3/Pvepj2ZxabHP0ePn/ADn3/wDCpyeTXFXUeV3h8O2e0TMfhQ+S9smS2S887WmZmfOZcQYD6gAAAAAAABtx6CHSVzjU9Gm7amOzr6raJvP25cMfzvEf+Z7m2zya2ncNbtO56bc9t1WXS63S5a5sGbHblbHes84mJ+LefoK9JThni/R6faeL9Tpth4grWKTfLaKaXVT3c6Xnspaf0befZM+FDk4Z32qtYcsa6yz8OOO9MmOuTHet6WiLVtWecTE90xL7a1aVm1rRWsRzmZnlEQprL61X9OzpLjR7Zp+jfadRHr9XFdRu00t20xRPPHin96famPKtfCy8+nD0j+E+C9DqNu4Z1Wm4g4hmJpSmC/X0+mt+lkvHZPL9Cs8+zlM172ie/btuO/b1q953fV5NXr9Zltmz5sk9t7T3/CPKI7Ijshc42Gd9rK+bLGusKIBfVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG23oI9JcROp6Nd31Pf1tVs83n7cuGP/AN8R+/7m3Dya2vX63a9y025bdqcul1mly1zYM2O3K2O9Z5xaJ84mG8nQP6SnDfFuh0+0cZ6vTbHxBWIpOXLPq9Lq5/Sraeylp8a2mI590zz5RR5OGd9qrWHLGustgRxx3pkx1yY71vS0RatqzziYnumJcrTFaza0xERHOZnwUlkas+nX0lRodp0/RxtOo/6nWxXU7ralu2mGJ548U8vG0x1pjyrXwsvLpv8ASP4T4L0Oo27hrVabiDiGazSlMF+vp9Nb9LJeOyeU/mVnn2cp6ve0T4h3jcuIN71m9bxq8ms1+syzlz5r997T/KI8IiOyI5RC5xsEzPayvmyxrrChAX1QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABT7hn/J9Na8T7U9lfit1W7vqPXanqVn2MfZHx8VEzORk739vEL2GnWoArpQAAAAAAAAAAAAAAAAAAAAAAAAAHfoc86fU1yfm91vguKJiYiYnnErWTWzaj1mH1Np9qnd8FziZNT0lW5FNx2SAC+qgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKjFrtbhjli1moxx+zkmHd8s7v+tdd/uL/ioR1F7R4lxOOs+YV3yzu/6113+4v+J8s7v+tdd/uL/ioR76lvq89Kn0hXfLO7/rXXf7i/4nyzu/6113+4v+KhD1LfU9Kn0hXfLO7/rXXf7i/wCJ8s7v+tdd/uL/AIqEPUt9T0qfSFd8s7v+tdd/uL/ifLO7/rXXf7i/4qEPUt9T0qfSFd8s7v8ArXXf7i/4nyzu/wCtdd/uL/ioQ9S31PSp9IV3yzu/6113+4v+J8s7v+tdd/uL/ioQ9S31PSp9IV3yzu/6113+4v8AifLO7/rXXf7i/wCKhD1LfU9Kn0hXfLO7/rXXf7i/4nyzu/6113+4v+KhD1LfU9Kn0hXfLO7/AK113+4v+J8s7v8ArXXf7i/4qEPUt9T0qfSFd8s7v+tdd/uL/ifLO7/rXXf7i/4qEPUt9T0qfSFd8s7v+tdd/uL/AInyzu/6113+4v8AioQ9S31PSp9IV3yzu/6113+4v+J8s7v+tdd/uL/ioQ9S31PSp9IV3yzu/wCtdd/uL/ifLO7/AK113+4v+KhD1LfU9Kn0hXfLO7/rXXf7i/4nyzu/6113+4v+KhD1LfU9Kn0hXfLO7/rXXf7i/wCJ8s7v+tdd/uL/AIqEPUt9T0qfSFd8s7v+tdd/uL/ifLO7/rXXf7i/4qEPUt9T0qfSFd8s7v8ArXXf7i/4nyzu/wCtdd/uL/ioQ9S31PSp9IV3yzu/6113+4v+J8s7v+tdd/uL/ioQ9S31PSp9IV3yzu/6113+4v8AifLO7/rXXf7i/wCKhD1LfU9Kn0hXfLO7/rXXf7i/4nyzu/6113+4v+KhD1LfU9Kn0hXfLO7/AK113+4v+J8s7v8ArXXf7i/4qEPUt9T0qfSFd8s7v+tdd/uL/ifLO7/rXXf7i/4qEPUt9T0qfSFd8s7v+tdd/uL/AInyzu/6113+4v8AioQ9S31PSp9IV3yzu/6113+4v+J8s7v+tdd/uL/ioQ9S31PSp9IV3yzu/wCtdd/uL/ifLO7/AK113+4v+KhD1LfU9Kn0hXfLO7/rXXf7i/4nyzu/6113+4v+KhD1LfU9Kn0hXfLO7/rXXf7i/wCJ8s7v+tdd/uL/AIqEPUt9T0qfSFd8s7v+tdd/uL/ifLO7/rXXf7i/4qEPUt9T0qfSFd8s7v8ArXXf7i/4nyzu/wCtdd/uL/ioQ9S31PSp9IV3yzu/6113+4v+L5bd92tWa23TWzE98Tnt+KiD1LfV76dPpD7e1r2m17Ta098zPOZfAcOwAAAAAAAAAAAE1sXF3Few4pxbHxPve145766PX5cMfdW0OW+cY8Xb7h9RvfFW+bpi5cuprNwy5q8vha0oMeajy93IA9eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJrYuLeK9hxeq2Pibetrx/o6PX5cMfdW0OW+cY8Xb7h9RvfFW+bpi5cuprNwy5q8vha0oMeajy93IA9eAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACm3HUfk+mm0T7duyvxVKA3TUev1M9WfYp2V/FDnydKfukxU7WUgDKXwAAAAAAAAAAAAAAAAAAAAAAAAAAAB26XNbBnrljwntjzh1D2JmJ3DyY37Lopat6Res84mOcS5IvZNRzrOntPbHbX4eSUa+O8XrEs+9es6AHbkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8mYiJmZ5RAKTddR6jTTWs+3fsj+soFUa/POo1Nr/mx2V+CnZWfJ3t+y/ip1qAIUgAAAAAAAAAAAAAAAAAAAAAAAAAAAAADniyWxZK5KTytWecLj0+WubDXJXutH3LZSOzan1eX1F59m/1fdKzxsnW3WfEoM9O0bTIDSUwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABHb1qPV4owVn2r9/uhXZclcWO2S88q1jnK3NRltmzWy277T9ytycvWvWPMpsFO07dYDNXQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB9iZiYmJ5TD4AuLb9RGo08Wn68dlviqFvbdqPyfURMz7Fuy34rhjtjnDVwZfUr7+VDLTrYATIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHRrtRGn083/ADp7Kx73lpisbl7EbnUI/etT1rxp6T2V7bfHyRj7aZtabTPOZnnMvjIyXm9u0tClYrGgBw6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEzs2p9Zj9Refap9X3whnPDktiy1yUnlas80uLJ6dtuMlO9dLnHXp8tc2GuSndMfc7GtE7jcM+Y0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALf3LU/lGonqz7Feyv4pDedT6vF6ik+1eO33QhVHlZd/ghawU/NIApLIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACu2jU+pzeqvPsXn7pTi1U7tWq9fh6lp+kp2T74817i5fySq58f5oVoC6rAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADr1GWuDDbLfuiPvdiD3bVeuzerpP0dP5yizZPTrt3jp3nSkzZLZctsl55zaebgDKmd+8tDwAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdmmzWwZq5Kd8eHnDrHsTMTuCY2ufDkrlxVyUnnW0c3NCbRqvVZfU3n2Lz2e6U21cOSMlds/JTpOgBK4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdeoy1w4bZL90fzJnUbkiNqXdtV6nF6uk/SXj7oQbsz5b5stsl57Zn7nWyc2T1LbX8dOkaAESQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATm06r1+L1d5+kpH3x5oNzwZb4ctclJ5WrKXDlnHbaPJTvGlzjq02amfDXJTunvjyl2taJiY3ChMa9gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBbrqvX5epSfo6d3vnzVm8av1dPUUn27R7U+UIZR5WX8kLWDH+aQBSWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFXtuqnTZuVp+jt9b3e9PRMTHOO2FrJbZtXziNNknt/Mn+i5xs2vwSrZ8e/xQlAF9VAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHRrdRXTYJyT2z3Vjzl23tWlJvaeVYjnMrf12ptqc827YrHZWPKEGfL6dfbylxY+8/s6cl7ZLze887TPOZcQZa8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPsTMTExPKY7Yl8AXBt2qjU4e3+0r2Wj+qqWzps18GaMlJ7Y74848lxafLTPirkpPZP8mnx83eNT5Us2PrO48OwBYQgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKDdtX6mnqsc/SWjtnyhze8Ujcva1m06hS7vq/WX9Rjn2Kz7U+co4GTe83tuWhWsVjUADh0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKvbdXOmy8rduO31o8vepB1W01ncPLVi0aldNZi0RMTExPdL6iNo1nVmNPln2Z+pM+HuS7Vx5IyV3DPvSaTqQBI5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcM2SmLHbJeeVYjtJnQ69bqa6bDN57bT2Vjzlb2S9sl5veedrTzmXZrNRfU5pyW7I7qx5Q6WXnzepPt4XsWPpH7gCBKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJvatZ66nqck/SVjsn9KEI+0tal4tWZi0TziUuLLOO23GSkXjS6RTbfqq6nFz7r1+tH9VS1a2i0bhQmJidSAPXgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD5MxETMzyiO9Bbnq51GTq0n6Ks9nv97v3fWdaZ0+KfZj60x4+5GKHJzb/DVbw4tfikAU1gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB2afNfBljJSe2P5rh0uemowxkp9seUrad+i1N9Nm60dtZ+tXzWMGb051PhDlx943HlcY4YslMuOMlJ51nuc2nE7UgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABHbrrfVVnDin25+tMfmw7dy1kabH1a8py27o8vegrTNrTa0zMz2zMqnIz9fw18rGHFv8AFL4Az1sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABV7dq502TlbnOO3fHl709W0WrFqzziY5xK1lftet9Rb1WWfo57p/Rn8Fvj5+v4beFfNi7e8JsI7Y5wNBUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPrtTTTYutPbafq183PVZ6afFOS8/CPOVvanNfPlnJkntnujyhXz5vTjUeU2LF3nc+HzLkvlyTkvPO097gDMmdroAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACS2rXdTlgzT7H5tp8PcmFqpXatd3YM1vdS0/8LvHz/lsrZsX5oSoC8qgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADrz5aYMU5Mk8oj+b7myUxY5yXnlWO9Aa7VX1OXnPOKR9WvkhzZoxx+6THjm8/s46zUX1OWb27Ij6seUOkGXMzadyvRERGoAHj0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABL7XruvywZp9rurbz9yTWqmNs1/rOWHNPt/m2nx/7r/Hz7/DZVzYvzVSQC4rAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADjkvXHSb3tFax3zJkvXHSb3tFax3zKB3DWW1N+Uc6447o/rKLNmjHH7pMeObya/V31OTxjHH1a/1UoMu1ptO5XoiKxqABy9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATG2a/1nLDmn2/zbT4/wDdJLVTG2a+L8sOe3t91bT4r/H5G/w2VcuHX4qpIBcVgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABxyXrjpN72itY75kyXrjpN72itY75lA7hrLam/KOdccd0f1lFmzRjj90mPHN5Nw1ltTflHOuOO6P6ypQZdrTadyvVrFY1AA5egAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJbbNw63LDnnt7q2nx90pRaqU2zcOXLDnns7q3nw90r2Dkflsq5cPzVLALqsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOGbJTFjnJktyrD5nzY8GOcmSeUR/NA63VZNTk5z2Uj6tfJDmzRjj90mPHN5/Zy1+rvqcnjXHH1a/1UoMy1ptO5XoiKxqABy9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASO26+cXLFmnnj7on9H/smImJiJiYmJ7phayt27XW08xTJztin/8AFcwcjr+G3hXy4d+9U6ONL1vSL0tFqz3TDkvqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6dVqMenx9fJPwjxlx1uqx6anO3bafq180DqM2TPknJknnP/CvmzxT2jymxYpt7z4ctXqcmpyde89nhWO6HSDNmZmdyuRERGoAHj0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABU6HWZNNf9LHPfVO4MuPNjjJjtzif5LZd2l1GTT5Ovjn4xPdKzh5E09p8IcmKLe8eVyDo0mpx6nH1qTymO+s98O9oxMWjcKcxMTqQB68AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFHuGuppo6teVss+Hl8XVuO4Rj54sExN/G3hCHtM2mZmZmZ75lUz8nr+GvlYxYd+9n3Le+S83vabWnvmXEGf5WwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHPFkviyRfHaa2jxTeg11NTHVtyrl8vP4IF9iZiYmJmJjumEuLNbHP7I8mOLwukRm37jFuWLUTEW8L+E/FJtOmSt43Clak1nUgDtyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4ZstMOOb5LRWsEzryeXKZiImZmIiO+ZRG4bjN+eLTzMV8beM/B0a/XX1M9WvOuPwjz+KkUM3J7fhqt4sOvewAprAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAr9v3C2Hljy87Y/CfGqgHVLzSdw5tWLRqV0Y71yUi9LRas90w5Ld0eqy6a/Ok86z31nulOaXU4tTTrY57fGs98NLFnrk9vlTyYpp/07gE6IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABH6/ca4uePDytk8Z8Ic3vWkbl1Ws2nUKjWavFpqc7TztPdWO+UHqtRk1GTrZJ+ER3Q673te83vabWnvmXFm5c85Pb4XMeKKf8AYAgSgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADliyXxXi+O01tHjDiHgTmg3CmblTLypk/lKuWqkdDuVsfLHn52p4W8Y/Few8r4uq5MHzVMjjS9b0i9LRas90w5LqsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOOS9cdJve0VrHfMunV6rFpq87zztPdWO+UJq9Vl1N+d55VjurHdCDLnrj9vlLjxTf8A6VOv3G2Xnjw8608Z8ZR4M697XncrlaxWNQAOHQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADv0mqy6a/Ok+z41nulN6PV4tTX2Z5X8az3rdfa2tW0WrMxMd0wnxZ7Y/b4RZMUX/wC10iL0O5xPLHqeyfC/4pOJiYiYmJifFo0yVvG4U7Ums6l9AduQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHVqM+LBTr5Lco8I8ZJmIjckRvw7UbrtyrTnj0/K1vG3hH4qPW6/JqOda+xj8o75+KjUcvK37UWseD5s5Xta9pte02tPfMuIKSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKnR63Lpp5RPWp41n+imHVbTWdw8mImNSuPS6nFqK88du3xrPfDvWvS1qWi1LTW0d0wldFucTypqOyf047vtX8XKi3tb2VMmCY96pMfImJiJiYmJ7ph9WkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOrUZ8WCnWy2iPKPGUPrdwy5+dKexj8o75+KLLmrj8+UlMc3V2t3KmLnTDyvfz8IQ+bLky3m+S02tPm4DOyZrZJ91ymOKeABE7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVGk1mbTT7M86eNZ7kzpNZh1Mcqz1b+NZ71vPsTMTzieUwnxZ7Y/b4RXxRddIh9Hud6cqajnev6Ud8filcWSmWkXx2i1Z8YaGPLXJHsqXx2p5cwEjgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABTavWYdPHK09a/hWO95a0VjcvYiZnUKiZiI5zPKEdrdzpTnTT8r2/S8I/FQavWZtTPK09Wn6MdymUcvKmfaizTBr3s55cl8t5vktNrT4y4ApzO1kAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAdmDNlwX62K81n/l1j2JmJ3BMbTWj3PHk5VzcsdvPwn8EhHbHOFqqnSa3Np+ys9an6M9y3i5Ux7XVr4Pmq4RS6TW4dRyiJ6t/0ZVS9W0WjcK0xMTqQB68AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfLWitZtaYiI75kH1wzZceGnXyXise9QavdK15108daf0p7kVmy5Mt+vkvNp96rk5Va+1fdPTBM+8q7Wbne/OmCJpX9Lxn8EfMzM85nnMvgo3yWvO7LVaRWPYAcOgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABXaTcs2LlXJ9JT398KEdVvak7iXNqxaNSuTTanDqI5479vjWe+HctaszW0WrMxMd0wkNLumSnKueOvX9KO9ex8uJ9rK18Ex/qmR14M+LPXrYrxbzjxh2LcTE+8K8xoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFJqtfgwc459e/6NfxROq1ufUc4m3Vp+jCDJyKU/eUtMNrJPV7jhw864/pL+7uj7UTqdVm1FueS3Z4Vjuh0ijkz2yefC1TFWoAhSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOVLWpaLUtNZjxiUjpd1tXlXUV60fpR3owd0yWp4lzalbeVzYc2LNXrYrxaPd4Oxa+O98dotS01tHjEpDS7revKuevWj9KO9dx8qs+1vZVvgmPCYHVgz4s9eeK8W848Ydq1ExPvCCY15AHoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACk1Wv0+DnHW69/Kv4ovVbhnz84ifV08q/igycilP3S0xWsldVrsGDnE269/0aorVa/Pn51iepTyr+KkFLJyL3/aFmmGtQBAlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfa2tW0WraazHjEq/Tbplpyrmr6yPPulHjumS1P9Zc2pFvK49PqsGePo7xz/Rnsl3rVjsnnCt0246jF2Wn1lfK3f8AeuU5ceLQr24/6U6KTTbhp83ZNvV28rfiq1qtotG4lXms18gDp4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA45L0x1617RWPOZPA5PkzERzmeUI7U7rjr2YK9efOeyEbqNTnzz9JkmY8o7IVr8mlfHumrgtPn2S+p3LBi5xT6W3u7vvRep12oz84m3Vr+jXshTCnkz3us0xVqAIUgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA79Pq8+D6l56v6M9sOgexaazuHkxE+Uzp91x25RmrNJ847YV+PJTJXrY71tHnErXcseS+O3Wpeaz5xK1Tl2j/b3QW48T4XQIbT7rlryjLWMkecdkpDT67TZuyuSK28rdkrdM9L+JQWxWqqQEqMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHG9q0r1r2iseczyUWo3TBTsxxOSfd2Q5tetPMuq0m3hXujUarBg/tMkc/0Y7ZQ+o1+pzdnX6lfKvYpFS/L/AEwnrx/1JLUbre3OMFIpHnbtlQZcmTLbrZL2tPvlwFS+S1/MrFaVr4gAcOgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHfg1eow9lMk8vKe2Ehg3as9mbHNffXuRAlpmvTxLi2OtvMLlw6jDmj6PJW3u8fudq1omYnnE8pVWDcNTi7Ov148rdq1Tlx+aEFuPPxKfEdg3XFbsy0tSfOO2FbizYssc8eStvhKzXJW/iUFqWr5h2AO3IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACnz63TYey2WJnyr2y8m0V95exEz4VAic+7Wnsw44j32/BQ59Tnzf2mS0x5d0K9+VSPHumrgtPlNZ9fpsXZOTrz5V7VBn3XLbsw1ikec9so4Vb8m9vHsmrhrDnlyZMtutkva0++XAFeZ2mAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH2JmJ5xMxPnD4Aq8O4arF2dfrx5W7Vbh3bHPZlx2rPnHbCHE1c96+JR2xVt8Llw6jBm/s8tbT5c+37natVUYdZqcX1MtuXlPbCxXmfqhDbj/AElcQicO7Wjsy4on31nkq8W4aXJ/edSfK0cliufHbxKK2K0fCrHytq2jnW0THnEvqVGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADry5sWKPpMla/GVJm3TT07KRbJPujlDi2StfMuopa3iFe+TMRHOZ5Qhc26ai3ZjiuOPvlR5c2XLPPJktb4ygty6x4jaWvHtPlO5tfpcXZOTrT5V7VFm3a89mHFFffbtRgrW5V7ePZNXBWHdm1OfN/aZbTHl3Q6QQTMz5SxER4AHj0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABype9J50vas+6eSqxblqqd94vH7UKMdVvaviXM1ifMJfFu9Z7MuKY99Z5qrFrtLk7ssVnyt2LeE9eVePPujnBWfC6azFo51mJjzh9WvS96Tzpe1Z908lTj3DVU/vOtHlaOaevMr8winjz8SnxE493t/eYYn31lU49z0tvrTanxj8E1c+O3yjnFePhWjqx58OT6mWlvdE9rtSxMT4RzGgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHyZiI5zMRHvB9FPk1mlx/WzU+zt/wCFPk3XBX6lL3/lCO2WlfMu4x2nxCQENk3bNb6lKU+PbKly6zU5PrZrfCJ5f8IbcukePdJHHtPlcGTLjxx9JkrX4zyUuXc9LT6s2vP7MIKe2eciG3LtPiEkcePmUnl3bJPZixVr77TzUmXW6nJ9bNaI8q9inEFs17eZSxjrHiCe2ecgI3YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7MebNj+plvX4S6x7EzHgmNqzHuWrr33i370O+m73j6+Gs/CeSMEkZ8kfKOcVJ+E3TddPP1q3r9nN3U12kv3Zqx8ez/lbwljl3jy4nj1XRTJS/1L1t8J5uS1XZTPnp9XNkj4WlJHM+sOJ430lcwt+m4auv97z+MQ7qbrqI+tTHb7JhJHLpLiePZNCKru/6WD7rO2u7aefrUyR9kS7jkY5+XM4rx8JAUddy0k9+SY+NZdtdZpbd2en2zydxkpPiXM0tHw7xwrmxW+rlpPwtDnHb3O4mJc6AAAAAAAAAAAAAAAAAAAAAfLWrX61oj4yD6Oq2owV+tmxx/mh1212kr35q/ZzlzN6x5l7FZn4VIorbnpY7pvb4VdVt2xfm4rz8ZiHE58cfLqMV5+EkIi273/Nw1j425uq+6aq3d1K/Cv4uJ5WOHcYLpwW7fW6q3fnt9nZ/w6b5L3+ve1vjPNHPMr8Q6jjz8yuS+fBT6+akfG0Oi+46Sv8AedafdEoARzzLfEO449fmUxfdsUfUxXt8Z5OjJu2efqY6V/mjhHPIyT8u4w0j4VOTXaq/fmtH7vY6LXteedrTaffPNxEU2tbzKSKxHgAcvQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB9iZjumYAHOM2avdlyR8LS5xq9THdnyfbbmDqLWj5edYco1+rjuzT9sRLnG5auP7yJ/ywDquS/wBZczSv0co3TVR+hP8AlfY3XUx+bin7J/EFmt7fVDasfR249yz2rzmmP7p/F24tdlvM8607PdP4glrafqjmIdn5Xk/Rp9x+V5P0afcCTcudQfleT9Gn3H5Xk/Rp9wG5NQfleT9Gn3OidwzRMx1cf3T+IObTL2Ih15N01Fbcopi+6fxcJ3XU8+7HH2f9wRWvb6pIrH0cZ3PVz+dWP8rjO46yf73l/lgFe+S/1TVpX6OE67Vz/f2cZ1Oonvz5f9Ugim9p+XXWv0cLZMlvrZLT8ZcAc726AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//Z" style={{width:22,height:22,borderRadius:"50%",marginRight:2,verticalAlign:"middle"}} /> DCOPS Jira Dashboard</div>
          <div style={{ color:"#64748b", fontSize:11, marginTop:2, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
            <span>{filtered.length.toLocaleString()} of {issues.length.toLocaleString()} tickets</span>
            <span>·</span>
            <span>{activeLocs.size} sites</span>
            <span>·</span>
            <span>{activeAssignees.size} assignees{dctOnly?" (DCT)":""}</span>
            {remapStats && <span style={{color:"#10b981"}}>· {((remapStats.resolved/remapStats.total)*100).toFixed(1)}% resolved</span>}
            {lastFetched && <span style={{color:"#475569"}}>· synced {lastFetched.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {dataSource === "jira" && (
            <button onClick={fetchFromJira} disabled={isFetching} style={{
              background:isFetching?"#334155":"#6366f122", border:"1px solid #6366f155",
              color:isFetching?"#64748b":"#a78bfa", borderRadius:7, padding:"6px 14px", cursor:isFetching?"not-allowed":"pointer", fontSize:12, fontWeight:600,
            }}>
              {isFetching ? "↻ Refreshing…" : "↻ Refresh"}
            </button>
          )}
          <select value={selectedPeriod} onChange={e=>setSelectedPeriod(Number(e.target.value))}
            style={{ background:"#1e293b", border:"1px solid #334155", color:"#e2e8f0", borderRadius:7, padding:"6px 10px", fontSize:12, cursor:"pointer" }}>
            {PERIOD_OPTIONS.map(p=><option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
          <button onClick={()=>setFiltersOpen(v=>!v)} style={{ background:"#1e293b", border:"1px solid #6366f155", color:"#a78bfa", borderRadius:7, padding:"6px 14px", cursor:"pointer", fontSize:12 }}>
            {filtersOpen?"▲":"▼"} Filters{(activeLocs.size<locations.length||activeAssignees.size<assignees.length||dctOnly)?" ●":""}
          </button>
          <button onClick={()=>{setIssues([]);setLoaded(false);resetCache();setRemapStats(null);setDctOnly(false);setLastFetched(null);setDataSource(null);}}
            style={{ background:"#1e293b", border:"1px solid #334155", color:"#94a3b8", borderRadius:7, padding:"6px 14px", cursor:"pointer", fontSize:12 }}>↩ Back</button>
        </div>
      </div>

      {/* Filters */}
      {filtersOpen && <FilterPanel
        locations={locations} assignees={assignees}
        activeLocs={activeLocs} activeAssignees={activeAssignees}
        dctOnly={dctOnly}
        onToggleLoc={toggleLoc} onToggleAssignee={toggleAssignee}
        onAllLocs={()=>setActiveLocs(new Set(locations))}
        onNoneLocs={()=>setActiveLocs(new Set())}
        onAllAssignees={()=>setActiveAssignees(new Set(assignees))}
        onNoneAssignees={()=>setActiveAssignees(new Set())}
        onToggleDct={handleToggleDct}
      />}

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, marginBottom:14, flexWrap:"wrap" }}>
        {[["planning","📊 Planning"],["matrix","🧮 Matrix"],["location","📍 By Site"],["tickets","📋 Tickets"],["trends","📈 Trends"]].map(([t,l])=>(
          <button key={t} onClick={()=>{
            setActiveTab(t);
            if(t==="trends" && !trendsData && !trendsLoading){
              setTrendsLoading(true);
              fetch(`/api/trends?window=${trendsWin}`)
                .then(r=>r.json()).then(d=>{setTrendsData(d);setTrendsLoading(false);})
                .catch(()=>setTrendsLoading(false));
            }
          }} style={tabBtn(t)}>{l}</button>
        ))}
      </div>

      {/* ── PLANNING TAB ── */}
      {activeTab === "planning" && (<>

        {/* Formula selector */}
        <div style={card()}>
          <div style={{ color:"#94a3b8", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Headcount Formula</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom: selectedFormula.id==="custom"?10:0 }}>
            {HC_FORMULAS.map(f => (
              <button key={f.id} onClick={()=>setSelectedFormula(f)} style={{
                flex:1, minWidth:120, textAlign:"left", cursor:"pointer", borderRadius:8, padding:"10px 12px",
                background:selectedFormula.id===f.id?f.color+"22":"#0f172a",
                border:`1px solid ${selectedFormula.id===f.id?f.color:"#334155"}`,
                transition:"all .15s",
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <span style={{ color:selectedFormula.id===f.id?f.color:"#e2e8f0", fontWeight:600, fontSize:12 }}>{f.label}</span>
                  <span style={{ background:f.color+"22", color:f.color, fontSize:9, padding:"1px 5px", borderRadius:3, fontWeight:600 }}>{f.badge}</span>
                </div>
                {f.tpw && <div style={{ color:"#94a3b8", fontSize:11 }}>{f.tpw} t/p/w · {f.tpd}/day</div>}
                {!f.tpw && <div style={{ color:"#94a3b8", fontSize:11 }}>set custom target</div>}
                <div style={{ color:"#475569", fontSize:10, marginTop:3, lineHeight:1.4 }}>{f.desc}</div>
              </button>
            ))}
          </div>
          {selectedFormula.id === "custom" && (
            <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:4 }}>
              <label style={{ color:"#94a3b8", fontSize:12 }}>Target tickets/person/week:</label>
              <input type="number" min="1" max="100" value={customTarget}
                onChange={e=>setCustomTarget(e.target.value)}
                style={{ width:70, background:"#0f172a", border:"1px solid #334155", color:"#e2e8f0", borderRadius:6, padding:"4px 8px", fontSize:13 }}/>
              <span style={{ color:"#475569", fontSize:11 }}>= {(customTarget/5).toFixed(1)} tickets/person/day</span>
            </div>
          )}
        </div>

        {/* Metric cards */}
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
          {[
            ["Tickets (filtered)", filtered.length.toLocaleString(), "#6366f1"],
            ["Active Sites",       activeLocs.size,                  "#10b981"],
            ["Active Assignees",   activeAssignees.size,             "#f59e0b"],
            ["Avg / Week",         (filtered.length/weeks).toFixed(1),"#22d3ee"],
            ["Period",             PERIOD_OPTIONS.find(p=>p.days===selectedPeriod)?.label||`${selectedPeriod}d`, "#a78bfa"],
            ["Avg MTTR " + (globalMttr?.slaCount > 0 ? "⚡SLA" : "⏱clk"), globalMttr ? fmtMttr(globalMttr.avgHours) : "—", mttrColor(globalMttr?.avgHours)],
            ["Total Servers",      Object.values(SERVER_COUNTS).reduce((a,b)=>a+b,0).toLocaleString() || "—", "#6366f1"],
          ].map(([label,value,color])=>(
            <div key={label} style={{ background:"#1e293b", border:`1px solid ${color}44`, borderRadius:10, padding:"12px 18px", flex:1, minWidth:110 }}>
              <div style={{ color:"#94a3b8", fontSize:10, marginBottom:4 }}>{label}</div>
              <div style={{ color, fontSize:22, fontWeight:700 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Planning table */}
        <div style={card()}>
          <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:14, marginBottom:12 }}>📍 Workload & Headcount by Site</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead><tr style={{ background:"#0f172a" }}>
                {["Site","Total","% Vol","Avg/Day","Avg/Wk","Avg/Mo","Headcount","DCT","T/P/W (Roster)","Servers","Srvr/HC","MTTR","Suggested HC","Gap"].map(h=>(
                  <th key={h}
                    onClick={()=>{ if(planSortCol===h){setPlanSortDir(d=>d==='desc'?'asc':'desc');}else{setPlanSortCol(h);setPlanSortDir('desc');} }}
                    style={{ padding:"8px 10px", textAlign:"left", color:planSortCol===h?"#e2e8f0":"#94a3b8",
                      fontSize:10, fontWeight:600, borderBottom:"1px solid #334155", whiteSpace:"nowrap",
                      cursor:"pointer", userSelect:"none",
                      background:planSortCol===h?"#1e293b":"transparent" }}>
                    {h}{planSortCol===h?(planSortDir==='desc'?' ↓':' ↑'):''}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {visLocs.map((loc,i)=>{
                  const total=locTotals[loc]||0;
                  const pct=filtered.length?((total/filtered.length)*100).toFixed(1):"0.0";
                  const avgDay=(total/selectedPeriod).toFixed(1);
                  const avgWk=parseFloat(wkAvg[loc]);
                  const avgMo=(total/(selectedPeriod/30)).toFixed(0);
                  const rosterHc  = headcount[loc] || 0;        // from Jira Assets — full roster
                  const dctHc     = dctHcBySite[loc] || 0;          // confirmed DCTs at site (roster)
                  const dctActive = dctActiveBySite[loc]?.size || 0; // DCTs who resolved tickets this period
                  const activeHc = locAssignees[loc]?.size || 0;    // unique assignees with tickets this period
                  const hc = rosterHc || activeHc || 1;
                  const t = parseFloat(tppw[loc]);                   // already uses roster if available
                  const tDisplay = t.toFixed(1);
                  const suggested=Math.max(1,Math.ceil(avgWk/hcTarget));
                  const gap=suggested-activeHc;  // Gap vs active headcount, not full roster
                  const tColor=t>hcTarget*1.1?"#ef4444":t>hcTarget*0.8?"#f59e0b":"#10b981";
                  const color=locColor(loc);
                  return (
                    <tr key={loc} style={{ background:i%2===0?"#0f172a":"#111827", borderBottom:"1px solid #1e293b" }}>
                      <td style={{ padding:"9px 10px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <div style={{ width:10, height:10, borderRadius:2, background:color, flexShrink:0 }}/>
                          <span style={{ fontWeight:600, color:"#e2e8f0" }}>{loc}</span>
                        </div>
                        <div style={{ marginTop:4, background:"#334155", borderRadius:3, height:4, overflow:"hidden" }}>
                          <div style={{ width:`${(total/MAX_LOC)*100}%`, background:color, height:"100%", borderRadius:3 }}/>
                        </div>
                      </td>
                      <td style={{ padding:"9px 10px", fontWeight:700, color:"#f1f5f9" }}>{total.toLocaleString()}</td>
                      <td style={{ padding:"9px 10px", color:"#94a3b8" }}>{pct}%</td>
                      <td style={{ padding:"9px 10px" }}><span style={badge("#64748b")}>{avgDay}/d</span></td>
                      <td style={{ padding:"9px 10px" }}><span style={badge("#22d3ee")}>{avgWk}/wk</span></td>
                      <td style={{ padding:"9px 10px" }}><span style={badge("#a78bfa")}>{avgMo}/mo</span></td>
                      {/* Headcount: all people active in queue */}
                      <td style={{ padding:"9px 10px" }}>
                        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                          <span style={badge(color)}>{hc || "—"}</span>
                          {activeHc > 0 && activeHc < hc && (
                            <span style={{ fontSize:9, color:"#475569" }}>{activeHc} active</span>
                          )}
                        </div>
                      </td>
                      {/* DCT: active / total DCT roster */}
                      <td style={{ padding:"9px 10px" }}>
                        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                          <span style={badge(dctActive > 0 ? "#10b981" : "#334155")}>
                            {dctActive}{dctHc > 0 ? ` / ${dctHc}` : ""}
                          </span>
                          {dctHc > 0 && dctActive < dctHc && (
                            <span style={{ fontSize:9, color:"#475569" }}>{dctHc - dctActive} not in queue</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding:"9px 10px" }}><span style={badge(tColor)}>{tDisplay}</span></td>
                      <td style={{ padding:"9px 10px" }}>
                        {SERVER_COUNTS[loc]
                          ? <span style={badge("#6366f1")}>{SERVER_COUNTS[loc].toLocaleString()}</span>
                          : <span style={{ color:"#334155" }}>—</span>}
                      </td>
                      <td style={{ padding:"9px 10px" }}>
                        {serversByHc[loc]
                          ? <span style={badge("#a78bfa")}>{serversByHc[loc]}</span>
                          : <span style={{ color:"#334155" }}>—</span>}
                      </td>
                      <td style={{ padding:"9px 10px" }}>
                        {(() => {
                          const m = mttrBySite[loc];
                          const mc = mttrColor(m?.avgHours);
                          return m ? (
                            <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                              <span style={badge(mc)}>{fmtMttr(m.avgHours)}</span>
                              <span style={{ fontSize:9, color:"#475569" }}>
                                {m.source === "SLA" ? `SLA (${m.slaCount}/${m.sampleSize})` : "wall-clock"}
                              </span>
                            </div>
                          ) : <span style={{ color:"#475569" }}>—</span>;
                        })()}
                      </td>
                      <td style={{ padding:"9px 10px", fontWeight:700, fontSize:16, color:gap>0?"#ef4444":"#10b981" }}>{suggested}</td>
                      <td style={{ padding:"9px 10px" }}>
                        <span style={{ fontWeight:600, color:gap>0?"#ef4444":gap<0?"#22d3ee":"#10b981", fontSize:12 }}>
                          {gap>0?`▲ +${gap} needed`:gap<0?`▼ ${Math.abs(gap)} over`:"✓ balanced"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Formula legend */}
        <div style={card({ borderColor:selectedFormula.color+"55" })}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
            <div>
              <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:13, marginBottom:4 }}>
                📐 Active formula: <span style={{ color:selectedFormula.color }}>{selectedFormula.label}</span>
              </div>
              <div style={{ background:"#0f172a", borderRadius:8, padding:"8px 12px", fontFamily:"monospace", fontSize:12, color:"#7dd3fc", display:"inline-block" }}>
                Required HC = ⌈ Avg Weekly Tickets ÷ {hcTarget} t/p/w ⌉
              </div>
              <div style={{ fontSize:11, color:"#64748b", marginTop:6 }}>
                T/P/W uses <strong style={{color:"#94a3b8"}}>Roster HC</strong> (Jira Assets) as denominator — not just active assignees
              </div>
            </div>
            <div style={{ fontSize:11, color:"#94a3b8", lineHeight:1.8 }}>
              <div><strong style={{color:"#10b981"}}>Green</strong> — below {Math.round(hcTarget*0.8)} t/p/w (under capacity)</div>
              <div><strong style={{color:"#f59e0b"}}>Yellow</strong> — {Math.round(hcTarget*0.8)}–{Math.round(hcTarget*1.1)} t/p/w (on target)</div>
              <div><strong style={{color:"#ef4444"}}>Red</strong> — above {Math.round(hcTarget*1.1)} t/p/w (overstretched)</div>
            </div>
          </div>
        </div>
      </>)}

      {/* ── MATRIX TAB ── */}
      {activeTab === "matrix" && (
        <div style={card()}>
          <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:14, marginBottom:12 }}>🧮 Assignee × Site Heat Map</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ borderCollapse:"collapse", fontSize:10 }}>
              <thead><tr style={{ background:"#0f172a" }}>
                <th style={{ padding:"5px 10px", textAlign:"left", color:"#94a3b8", fontWeight:600, borderBottom:"1px solid #334155", borderRight:"1px solid #334155", whiteSpace:"nowrap", minWidth:120, fontSize:10 }}>Assignee</th>
                {visLocs.map(loc=>(
                  <th key={loc} style={{ padding:"4px 6px", color:locColor(loc), fontWeight:600, borderBottom:"1px solid #334155", borderRight:"1px solid #1e293b", whiteSpace:"nowrap", textAlign:"center", minWidth:52, fontSize:9 }}>{loc}</th>
                ))}
                <th style={{ padding:"8px 10px", color:"#e2e8f0", fontWeight:700, borderBottom:"1px solid #334155", textAlign:"center", minWidth:60 }}>TOTAL</th>
              </tr></thead>
              <tbody>
                {visAssignees.map((assignee,i)=>(
                  <tr key={assignee} style={{ background:i%2===0?"#0f172a":"#111827", borderBottom:"1px solid #1e293b" }}>
                    <td style={{ padding:"5px 8px", fontWeight:600, color:"#e2e8f0", borderRight:"1px solid #334155", whiteSpace:"nowrap", fontSize:10 }}>
                      {assignee}
                      {DCT_LIST.has(assignee)&&<span style={{ marginLeft:6, fontSize:9, color:"#6366f1", background:"#6366f122", padding:"1px 5px", borderRadius:3 }}>DCT</span>}
                    </td>
                    {visLocs.map(loc=>{
                      const count=((byAssigneeLoc[assignee]||{})[loc])||0;
                      const maxInLoc=Math.max(1,...visAssignees.map(a=>((byAssigneeLoc[a]||{})[loc])||0));
                      const color=locColor(loc);
                      return (
                        <td key={loc} style={{ padding:"4px 5px", textAlign:"center", borderRight:"1px solid #1e293b" }}>
                          {count>0
                            ?<div style={{ background:`${color}${Math.round((count/maxInLoc)*220+20).toString(16).padStart(2,"0")}`, borderRadius:5, padding:"3px 6px", color:"#fff", fontWeight:700, display:"inline-block", minWidth:28 }}>{count}</div>
                            :<span style={{color:"#334155"}}>—</span>}
                        </td>
                      );
                    })}
                    <td style={{ padding:"8px 10px", textAlign:"center", fontWeight:700, color:"#e2e8f0" }}>{assigneeTotals[assignee]||0}</td>
                  </tr>
                ))}
                <tr style={{ background:"#1e293b", borderTop:"2px solid #334155" }}>
                  <td style={{ padding:"8px 14px", fontWeight:700, color:"#94a3b8", borderRight:"1px solid #334155", fontSize:10 }}>SITE TOTAL</td>
                  {visLocs.map(loc=>(
                    <td key={loc} style={{ padding:"8px 10px", textAlign:"center", fontWeight:700, color:locColor(loc), borderRight:"1px solid #1e293b" }}>{locTotals[loc]||0}</td>
                  ))}
                  <td style={{ padding:"8px 10px", textAlign:"center", fontWeight:700, color:"#6366f1" }}>{filtered.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BY SITE TAB ── */}
      {activeTab === "location" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:12 }}>
          {visLocs.map(loc=>{
            const total=locTotals[loc]||0, color=locColor(loc);
            const topAssignees=[...Object.entries(filtered.filter(r=>r.location===loc).reduce((m,r)=>{m[r.assignee]=(m[r.assignee]||0)+1;return m;},{}))].sort((a,b)=>b[1]-a[1]).slice(0,5);
            const suggested=Math.max(1,Math.ceil(parseFloat(wkAvg[loc])/hcTarget));
            const gap=suggested-(headcount[loc]||1);
            return (
              <div key={loc} style={{ background:"#1e293b", border:`1px solid ${color}44`, borderRadius:10, padding:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <span style={{ fontWeight:700, color:"#e2e8f0", fontSize:13 }}>{loc}</span>
                  <span style={badge(color)}>{total.toLocaleString()}</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:10 }}>
                  {[["Per Day",(total/selectedPeriod).toFixed(1)],["Per Week",parseFloat(wkAvg[loc])],["Per Month",(total/(selectedPeriod/30)).toFixed(0)]].map(([l,v])=>(
                    <div key={l} style={{ background:"#0f172a", borderRadius:6, padding:"7px 4px", textAlign:"center" }}>
                      <div style={{ color, fontSize:17, fontWeight:700 }}>{v}</div>
                      <div style={{ color:"#64748b", fontSize:9 }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background:"#334155", borderRadius:3, height:4, overflow:"hidden", marginBottom:8 }}>
                  <div style={{ width:`${(total/MAX_LOC)*100}%`, background:color, height:"100%", borderRadius:3 }}/>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                  {[
                    ["HC (Assets)", headcount[loc]||"—", "#94a3b8"],
                    ["Active", locAssignees[loc]?.size||0, "#64748b"],
                    ["DCT HC",   dctHcBySite[loc] || "—",              "#f59e0b"],
                    ["DCT Active",dctActiveBySite[loc]?.size || 0,   "#10b981"],
                    ["Servers", SERVER_COUNTS[loc]?.toLocaleString() || "—", "#6366f1"],
                    ["Srv/HC", serversByHc[loc] || "—", "#a78bfa"],
                    ["T/P/W", tppw[loc], (() => { const t=parseFloat(tppw[loc]); return t>hcTarget*1.1?"#ef4444":t>hcTarget*0.8?"#f59e0b":"#10b981"; })()],
                    ["MTTR", (() => { const m=mttrBySite[loc]; return m ? fmtMttr(m.avgHours) : "—"; })(), (() => { const m=mttrBySite[loc]; return mttrColor(m?.avgHours); })()],
                  ].map(([l,v,c]) => (
                    <div key={l} style={{ background:"#0f172a", borderRadius:5, padding:"5px 8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ color:"#475569", fontSize:10 }}>{l}</span>
                      <span style={{ color:c, fontSize:12, fontWeight:700 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", justifyContent:"flex-end", fontSize:10, marginBottom:8 }}>
                  <span style={{ fontWeight:600, color:gap>0?"#ef4444":gap<0?"#22d3ee":"#10b981" }}>
                    {gap>0?`+${gap} needed`:gap<0?`${Math.abs(gap)} over`:"✓ balanced"}
                  </span>
                </div>
                <div style={{ color:"#94a3b8", fontSize:10, fontWeight:600, marginBottom:4 }}>TOP ASSIGNEES</div>
                {topAssignees.map(([name,cnt])=>(
                  <div key={name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                    <span style={{ color:"#cbd5e1", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:155 }}>{name}</span>
                    <span style={badge(color,true)}>{cnt}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TICKETS TAB ── */}
      {activeTab === "tickets" && (
        <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid #334155" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead style={{ background:"#1e293b" }}><tr>
              {["Key","Summary","Assignee","Reporter","Priority","Site","Created"].map(h=>(
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:"#94a3b8", fontSize:10, fontWeight:600, textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map((r,i)=>(
                <tr key={r.key+i} style={{ background:i%2===0?"#0f172a":"#111827", borderBottom:"1px solid #1e293b" }}>
                  <td style={{ padding:"7px 10px" }}>
                    <a href={`https://coreweave.atlassian.net/browse/${r.key}`} target="_blank" rel="noreferrer" style={{ color:"#7dd3fc", textDecoration:"none", fontWeight:600 }}>{r.key}</a>
                  </td>
                  <td style={{ padding:"7px 10px", maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#e2e8f0" }} title={r.summary}>{r.summary}</td>
                  <td style={{ padding:"7px 10px", whiteSpace:"nowrap", color:"#e2e8f0" }}>
                    {r.assignee}
                    {DCT_LIST.has(r.assignee)&&<span style={{ marginLeft:5, fontSize:9, color:"#6366f1", background:"#6366f122", padding:"1px 5px", borderRadius:3 }}>DCT</span>}
                  </td>
                  <td style={{ padding:"7px 10px", whiteSpace:"nowrap", color:"#94a3b8" }}>{r.reporter}</td>
                  <td style={{ padding:"7px 10px" }}>
                    <span style={badge(r.priority==="Critical"?"#ef4444":r.priority==="High"?"#f97316":r.priority==="Low"?"#22c55e":"#3b82f6",true)}>{r.priority}</span>
                  </td>
                  <td style={{ padding:"7px 10px" }}><span style={badge(locColor(r.location),true)}>{r.location}</span></td>
                  <td style={{ padding:"7px 10px", color:"#64748b", whiteSpace:"nowrap" }}>{r.created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TRENDS TAB ── */}
      {activeTab === "trends" && (() => {
        const PROJS = [
          {k:"do",  label:"DO",  c:"#3b82f6", dash:[]},
          {k:"sda", label:"SDA", c:"#22c55e", dash:[6,3]},
          {k:"sdp", label:"SDP", c:"#eab308", dash:[3,3]},
          {k:"sdo", label:"OSP", c:"#f97316", dash:[8,3,2,3]},
          {k:"sde", label:"EGL", c:"#10b981", dash:[4,4]},
          {k:"sdh", label:"HRN", c:"#06b6d4", dash:[2,2]},
          {k:"sds", label:"SNP", c:"#a855f7", dash:[6,2]},
        ];
        const WINS = [
          {k:"1d",lb:"1d"},{k:"7d",lb:"7d"},{k:"30d",lb:"30d"},
          {k:"60d",lb:"60d"},{k:"90d",lb:"90d"},{k:"180d",lb:"180d"},{k:"365d",lb:"365d"},
        ];

        const loadWin = (w) => {
          setTrendsWin(w); setTrendsLoading(true); setTrendsData(null);
          fetch(`/api/trends?window=${w}`)
            .then(r=>r.json()).then(d=>{setTrendsData(d);setTrendsLoading(false);})
            .catch(()=>setTrendsLoading(false));
        };

        const siteKeys = trendsData ? Object.keys(trendsData.sites).sort() : [];
        const activeSite = trendsSite && siteKeys.includes(trendsSite) ? trendsSite : siteKeys[0] || "";
        const sd    = trendsData && activeSite ? (trendsData.sites[activeSite] || {}) : {};
        const labels = trendsData ? trendsData.labels : [];
        const pts    = labels.length;

        // Chart helpers
        const W=560, H=220, padL=44, padB=28, padT=10, padR=16;
        const cW = W - padL - padR;
        const cH = H - padB - padT;

        const allVals = PROJS.flatMap(p=>(sd[p.k]||[]));
        const maxV = Math.max(...allVals, 1);
        const yTicks = [0,.25,.5,.75,1].map(f=>Math.round(maxV*f));

        const xPx  = i => padL + (pts>1 ? (i/(pts-1))*cW : cW/2);
        const yPx  = v => padT + cH - (v/maxV)*cH;

        const polyline = (arr, dash) => {
          if(!arr||arr.length===0) return null;
          const pts2 = arr.map((v,i)=>`${xPx(i).toFixed(1)},${yPx(v).toFixed(1)}`).join(" ");
          return pts2;
        };

        // MoM: compare last period vs prev period
        const lastIdx = pts-1;
        const prevIdx = Math.max(0, pts-2);
        const momCard = (proj) => {
          const arr = sd[proj.k] || [];
          const cur  = arr[lastIdx] || 0;
          const prev = arr[prevIdx] || 0;
          const pct  = prev>0 ? ((cur-prev)/prev*100) : 0;
          const avg  = arr.length ? Math.round(arr.reduce((a,v)=>a+v,0)/arr.length) : 0;
          const peak = Math.max(...arr,0);
          const peakIdx = arr.indexOf(peak);
          const peakLbl = labels[peakIdx] ? labels[peakIdx].slice(0,7) : "—";
          return {cur,prev,pct,avg,peak,peakLbl};
        };
        const totalCur = PROJS.reduce((s,p)=>{const a=sd[p.k]||[];return s+(a[lastIdx]||0);},0);

        // Type breakdown for last period
        const lastPeriodLabel = labels[lastIdx] ? labels[lastIdx].slice(0,7) : "";

        if(trendsLoading) return <div style={{color:"#64748b",textAlign:"center",padding:"60px 0",fontSize:13}}>Loading…</div>;

        return (
          <div style={{color:"#f1f5f9"}}>
            {/* Controls */}
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:"#94a3b8"}}>Site</span>
                <select value={activeSite} onChange={e=>setTrendsSite(e.target.value)} style={{
                  fontSize:12,padding:"5px 10px",borderRadius:6,border:"1px solid #334155",
                  background:"#1e293b",color:"#f1f5f9",cursor:"pointer",minWidth:110,
                }}>
                  {siteKeys.length===0
                    ? <option>— load data —</option>
                    : siteKeys.map(s=><option key={s} value={s}>{s}</option>)
                  }
                </select>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:"#94a3b8"}}>Window</span>
                <select value={trendsWin} onChange={e=>loadWin(e.target.value)} style={{
                  fontSize:12,padding:"5px 10px",borderRadius:6,border:"1px solid #334155",
                  background:"#1e293b",color:"#f1f5f9",cursor:"pointer",
                }}>
                  {[["1d","Last 24 hours"],["7d","Last 7 days"],["30d","Last 30 days"],
                    ["60d","Last 60 days"],["90d","Last 90 days"],["180d","Last 180 days"],["365d","Last 12 months"]
                  ].map(([k,lb])=><option key={k} value={k}>{lb}</option>)}
                </select>
              </div>
              {!trendsData && (
                <button onClick={()=>loadWin(trendsWin)} style={{
                  padding:"5px 14px",fontSize:12,fontWeight:600,borderRadius:6,
                  border:"1px solid #6366f1",background:"#6366f1",color:"#fff",cursor:"pointer",
                }}>Load Data</button>
              )}
            </div>

            {!trendsData ? (
              <div style={{color:"#64748b",textAlign:"center",padding:"60px 0",fontSize:13}}>
                Click <b style={{color:"#f1f5f9"}}>Load Data</b> to fetch trends.
              </div>
            ) : (
              <>
                {/* Legend */}
                <div style={{display:"flex",gap:16,marginBottom:10,flexWrap:"wrap"}}>
                  {PROJS.map(p=>(
                    <span key={p.k} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#94a3b8"}}>
                      <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5"
                        stroke={p.c} strokeWidth="2"
                        strokeDasharray={p.dash.length?p.dash.join(","):"none"}/></svg>
                      {p.label}
                    </span>
                  ))}
                </div>

                {/* Chart */}
                <div style={{background:"#0d1117",borderRadius:10,padding:"16px 12px",marginBottom:20}}>
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{display:"block",maxHeight:240}}>
                    {/* grid lines */}
                    {yTicks.map((v,i)=>(
                      <g key={i}>
                        <line x1={padL} y1={yPx(v).toFixed(1)} x2={W-padR} y2={yPx(v).toFixed(1)}
                          stroke="rgba(255,255,255,.07)" strokeWidth=".5"/>
                        <text x={padL-4} y={yPx(v)+4} textAnchor="end" fill="#475569" fontSize="9">{v>=1000?(v/1000).toFixed(0)+"k":v}</text>
                      </g>
                    ))}
                    {/* x labels — show ~8 evenly */}
                    {labels.map((l,i)=>{
                      const step = Math.max(1,Math.floor(pts/8));
                      if(i%step!==0 && i!==pts-1) return null;
                      return <text key={i} x={xPx(i).toFixed(1)} y={H-8} textAnchor="middle" fill="#475569" fontSize="9">{l.slice(0,7)}</text>;
                    })}
                    {/* lines + dots */}
                    {PROJS.map(p=>{
                      const arr=sd[p.k]||[];
                      if(!arr.length) return null;
                      const pts2=arr.map((v,i)=>`${xPx(i).toFixed(1)},${yPx(v).toFixed(1)}`).join(" ");
                      return (
                        <g key={p.k}>
                          <polyline points={pts2} fill="none" stroke={p.c} strokeWidth="1.8"
                            strokeDasharray={p.dash.length?p.dash.join(","):undefined}
                            strokeLinejoin="round" strokeLinecap="round" opacity=".9"/>
                          {arr.map((v,i)=>(
                            <circle key={i} cx={xPx(i).toFixed(1)} cy={yPx(v).toFixed(1)} r="2.5" fill={p.c} opacity=".85"/>
                          ))}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* MoM stats */}
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>
                  Month-over-month — {activeSite} · comparing {labels[prevIdx]?.slice(0,7)||"—"} → {labels[lastIdx]?.slice(0,7)||"—"}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginBottom:20}}>
                  <div style={{background:"#1e293b",borderRadius:8,padding:"12px 14px"}}>
                    <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Total tickets ({lastPeriodLabel})</div>
                    <div style={{fontSize:24,fontWeight:700,color:"#f1f5f9"}}>{totalCur.toLocaleString()}</div>
                  </div>
                  {PROJS.map(p=>{
                    const {cur,pct,avg,peak,peakLbl}=momCard(p);
                    const up=pct>0; const col=up?"#22c55e":"#ef4444";
                    return (
                      <div key={p.k} style={{background:"#1e293b",borderRadius:8,padding:"12px 14px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                          <span style={{fontSize:10,color:"#64748b"}}>{p.label}</span>
                          <span style={{fontSize:11,fontWeight:700,color:col}}>{up?"▲":"▼"} {Math.abs(pct).toFixed(1)}%</span>
                        </div>
                        <div style={{fontSize:22,fontWeight:700,color:"#f1f5f9",marginBottom:4}}>{cur.toLocaleString()}</div>
                        <div style={{fontSize:9,color:"#475569"}}>avg {avg} / period · peak {peak.toLocaleString()} ({peakLbl})</div>
                      </div>
                    );
                  })}
                </div>

                {/* Type breakdown */}
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>
                  Type breakdown — {lastPeriodLabel}
                </div>
                <div style={{background:"#1e293b",borderRadius:8,padding:"12px 16px"}}>
                  {PROJS.map(p=>{
                    const arr=sd[p.k]||[]; const v=arr[lastIdx]||0;
                    const pct=totalCur>0?(v/totalCur*100):0;
                    return (
                      <div key={p.k} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <span style={{width:30,fontSize:11,color:"#94a3b8",flexShrink:0}}>{p.label}</span>
                        <div style={{flex:1,height:8,background:"#0f172a",borderRadius:4,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct.toFixed(1)}%`,background:p.c,borderRadius:4}}/>
                        </div>
                        <span style={{width:36,fontSize:11,textAlign:"right",color:"#64748b"}}>{Math.round(pct)}%</span>
                        <span style={{width:52,fontSize:11,textAlign:"right",color:"#94a3b8"}}>{v.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })()}


    </div>
  );
}
