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
// Add names here — each entry must match the assignee displayName exactly
// Devon: share your DCT list and this will be filled in automatically
const DCT_LIST = new Set([
  "Dan Stillman",
  "Graham Lawson",
  "Jesse Ball",
  "Robert Hernandez",
  "Andrew Klentzman",
  "Angel Trevino",
  "Arthur Trinidad",
  "Brayden Williams",
  "Chase Coffaro",
  "Danny James",
  "Devon Loud",
  "Dexter Otokunrin",
  "George Puente",
  "Gerardo Garcia",
  "Joe Duncan",
  "Jofiel Gomez",
  "Josh Nuerge",
  "Kade LaCroix",
  "Kevin Ly",
  "Mark McDowell",
  "Michael Collins",
  "Nevin Thomas",
  "Nick Terrazas",
  "Paul Dumerer",
  "Rob Bradley",
  "Sheng Liang",
  "Tayo Adewoye",
  "Tim Perez",
  "Tony Grijalva",
  "Xavier Evans",
  "Anthony Martin",
  "Brent Waller",
  "Christian Woicikowfski",
  "Fred Bailey",
  "Harrison Williams",
  "Heath Kidd",
  "Jake Guerrant",
  "James Matthews Jr.",
  "Jason Maples",
  "Jeremy Iwanowski",
  "Jonathon Bouchard",
  "Mike West",
  "Ron Jones",
  "Roy Toral",
  "Scott Rucker",
  "Stephen Pattarini",
  "Thomas Alexander",
  "Victor Yore",
  "Blanchard Kasongo",
  "Carric Dixon",
  "Chitimpa Chingwengwezi",
  "Danny Kirbie",
  "Devin Harper",
  "Gbanya Kamanda",
  "Mario Westbrook",
  "Mark Moore",
  "Nilo Zamora",
  "Ricardo Padilla",
  "Tim Maruska",
  "Vexton Buggs",
  "Ahmed Nuhu",
  "Alan Bersavage",
  "Cody Sheetz",
  "Daniel Martinez",
  "Dario Garcia",
  "John Wray",
  "Mitchell Sabol",
  "Robert Keller",
  "Sergio De Anda",
  "Tom Apostol",
  "Tyler Lee",
  "Abiodun Oyeleke",
  "Andre Santos",
  "Geo Fernandez",
  "Jason Jarosh",
  "Mitchell Segerson",
  "Nancy Hutchings",
  "Vothy Puch",
  "Chris Grey",
  "Dan Menezes",
  "Everton Small",
  "Ivan Robles",
  "Matthew Forsyth",
  "Zakaullah Khan",
  "Bill Miller",
  "Billy Parkerson",
  "Brady Miller",
  "Daniel Parkerson",
  "Dawson Post",
  "Gavin McCray",
  "Ivan Martinez",
  "John Salazar",
  "Josef Stroup",
  "Justin Clark",
  "Kyle Kotchenreuther",
  "Marcus McCord",
  "Marvin Villanueva",
  "Matthew Morris",
  "Pierre Nacoulma",
  "Timothy McGaha",
  "Timothy Williams",
  "Tom West",
  "Tyler Holloway",
  "joey hester",
  "Afton Harrow",
  "Atoi Smith",
  "Brian Zolnai",
  "Bryan Meyer",
  "Cam Nhean",
  "Collin Grogan",
  "Drue Berkheimer",
  "Edwin Rivera",
  "Erik Dillon",
  "Erik Jones",
  "Giselle Smith",
  "Guy Frederick",
  "Jason Boyce",
  "Jason Stimpson",
  "Jeffrey Villena",
  "Jeremy Knappe",
  "Jose Fernandez",
  "Julian Alvarez",
  "Julian Ascencio",
  "KB Baker",
  "Melvin Valentin",
  "Patrick Wilson",
  "Seth Geiser",
  "Seth Schiele",
  "William Morrow",
  "Andrew Grasso",
  "Anthony Bellingeri",
  "KERON Goodridge",
  "Linvol Cummings",
  "Obed Amoo",
  "Bryan Newbill",
  "Dustin Breazeale",
  "Ernesto Padilla",
  "Jereme Solomon",
  "Joshua Stowe",
  "Kendall Lee",
  "Marlon Wolfe",
  "Jaco Steynberg",
  "Jakob Parsons",
  "John Hamilton",
  "Kelly Shea",
  "Mark Galvan",
  "Myron Shelby",
  "Nelson Evangelista",
  "Oscar Torres",
  "Samuel Lacy",
  "Travis Jamail",
  "Arezki Nadji",
  "Arthur Chisolm",
  "Corey Stedman",
  "Donovan Martin",
  "Gabriel De Goes",
  "John Maronna",
  "Matthew Fusco",
  "Otneal Woods",
  "Quade Riley",
  "Tony Francovilla",
  "Yaw Frimpong",
  "Charles Payne II",
  "Colin McKay",
  "Evan Storey",
  "Hunter Adams",
  "Justin Spence",
  "Loki Blanchett",
  "Noah Kim",
  "Stephen Cantrell",
  "Thomas Brennecke",
  "William McMichael",
  "Logan Davis",
  "Bhavik Patel",
  "Brian Mabe",
  "Chad Watts",
  "Christian Rios",
  "Christopher Freeman",
  "Chuks Ihuoma",
  "Clarence Shields",
  "David Davidson",
  "Erin Rudd",
  "Eve Spainhower",
  "Faufili Lavea",
  "Francais Falansa Mabeka",
  "Geoffrey Greene",
  "Hernan Arce",
  "Jake Grantham",
  "Jesse Atkinson",
  "Johnathan Jackson",
  "Jon Cortez",
  "Kiana Massey",
  "Mike Morton",
  "Mike Parker",
  "Norman Norwood Jr",
  "Thien Nguyen",
  "Alexis McCracken",
  "Austin Hall",
  "Blaze Nelson",
  "Brett Phillips",
  "Jay Randall",
  "Jeremy Smith",
  "Joshua Duckett",
  "Kevin Cone",
  "Mahamadi Kiogo",
  "Zach Brown",
  "Alpha Diallo",
  "Charlie Valentine",
  "Daniel Borders",
  "Jamie Lee",
  "Kirk Taylor",
  "Nadarrius Eckers",
  "Travis Killette",
  "Anthony Zayas Rodriguez",
  "Brianna Fisher",
  "Chris Berry",
  "Fernando Jeorge",
  "James Jones",
  "Kenan Vanecek",
  "Milton Torres",
  "Nicole Morgas",
  "Andrew Hulsey",
  "Jonathan Gomez",
  "Tony Evans",
  "Walt Raemhild",
  "Brandon Chaney",
  "Damion Cooper",
  "Darren Vaughn",
  "Justin Highsmith",
  "Peter Krnich",
  "Randy Lemons",
  "Trevor Finch",
  "Tyrone Locke",
  "Adrian Hall",
  "Austin Culp",
  "Francis Momoh",
  "Ira Simmons",
  "Jonathon Alfano",
  "Justen Davidson",
  "Sumit Samuel",
  "Zeke Rodriguez",
  "Anil Shah",
  "Lawrence Fusco",
  "Michael Meola",
  "Mike LaFace",
  "Rodrigo Gonzalez Silveira",
  "Alexander Antwan",
  "Andy Ip",
  "Brett DuBois",
  "Brian Simpkins",
  "Daniel Zaya",
  "Ethan Rotar",
  "Leo Rossell",
  "Nathan Arnold",
  "Osita Nduka",
  "Aki Tesfamichael",
  "Isaiah Lang",
  "Jeremy Francis",
  "Jose Rodriguez",
  "Liana McCracken",
  "Mike Garcia",
  "Tyler Noller",
  "Addison Ruiz",
  "Alle Parmenter",
  "Connor Soefje",
  "Devin Bustillos",
  "Gustavo Chavez",
  "Abdul Hameed",
  "Abdullah Alblooshi",
  "Abid Hussain",
  "Afeef Ahmed",
  "Ammar Ahmed",
  "Andrew Ramirez",
  "Carlos Ellis",
  "Erron Wilson",
  "Everett Holmes",
  "Hamdan Albalooshi",
  "Howard Cook",
  "Jacob Muir",
  "Jeffery Fourkiller",
  "Jose Gutierrez",
  "Jose Javier-Palomo",
  "Kader Kondiano",
  "Kenneth Sedgwick",
  "Khalifa Alblooshi",
  "Larry Wendt",
  "Leroy Pruitt",
  "Lindsey Philpott",
  "Marlon Jacobs",
  "Matthew Brennan",
  "Michael Ramirez",
  "Monica Apodaca",
  "Nathan Lindorf",
  "Nicholas Smith",
  "Nick McNeil",
  "Randall Crump",
  "Ricardo Trujillo",
  "Sharik Banipal",
  "Spartacous Cacao",
  "Teegwende Sawadogo",
  "Victor Obioma",
  "Will Cabrera",
  "Antonio Hudspeth",
  "Cameron Aderibigbe",
  "Chan Vilayvanh",
  "Dom Sonemangkhala",
  "Edwin Esene",
  "Gabriel Oteri",
  "Garrett Tompkins",
  "Javier Garcia",
  "Joshua Hollingsworth",
  "Latrice Reece",
  "Lokesh Dahal",
  "Nartey Tanihu",
  "Neyazi Eltayeb",
  "Rob Chatter",
  "Stephen Endress",
  "Steven Sallis",
  "Thomas Del Valle",
  "Trent Hall",
  "Troy Wilkinson",
  "Wogene Biru",
  "Christian Quiroz",
  "Christopher Matz",
  "Cody Kiminski",
  "Cori Marie",
  "Dan Brown",
  "Dante Traghella",
  "Dino Dean",
  "Franklin Ossai",
  "George Baltierrez",
  "Henil Patel",
  "Hunter Fellman",
  "James Owens",
  "Joel Gonzalez",
  "John Ravago",
  "Justin Austin",
  "Kedarion Chance",
  "Kevin Hutcheson",
  "Logan White",
  "Luis Magana",
  "Mark Orlov",
  "Maximus Gradwohl",
  "Michael Welch",
  "Nick Paige",
  "Roopesh Kaithal",
  "Tam Vu-Tam",
  "Ben Walker",
  "Corey Hall",
  "David Williamson",
  "Eddie Bhopal",
  "Faisal Al Belushi",
  "Herby Isidor",
  "Jason Korenek",
  "Ryan Hebron",
  "Ryan Mendez",
  "Shawn Hiles",
  "Takesure Kondowe",
  "Tommy Nguyen",
  "Ahmed Ragab",
  "Chris Jump",
  "Igor Shparber",
  "Jerry Della Femina",
  "Manny Fernandes",
  "Nicholas Freeman",
  "Omar Khan",
  "Sergey Zelinsky",
  "Thomas G Laird",
  "Christopher Conley",
  "Oliver Luo",
  "Rodney Ballard",
  "Brian Schaeffer",
  "Josh Burk",
  "Joshua Webb",
  "Phil Robinson",
  "Vayan Adams",
  "Chester Chambers",
  "Collin Piper",
  "Da'wyna Pearson",
  "David Ellis",
  "Dawn Schimmel",
  "Jack Benjamin",
  "Mercy Ngwe",
  "Tom Butcher",
  "Andrea Smith",
  "Brian Barbeau",
  "Carter Kelso",
  "Cassidy Hayes",
  "Chanler Simpson",
  "Charley Franson",
  "Gavin Drotzmann",
  "Jonathan Garrett",
  "Joseph Aviles",
  "Julien Voorhoeve",
  "Kyle Sanchez",
  "Michael Allen",
  "Mike Tiffany",
  "Orlando Camba",
  "Tanner Pavlacky",
  "Tomas Mendoza",
  "Brice Lucero",
  "Grayson Schmidt",
  "Jamie Zaragoza",
  "Shon Hilton",
  "Stephanie Garcia",
  "Steven Mather",
  "Todd Milev",
  "Mike Ureste",
  "Monico Salvador",
  "Sean Anderson",
  "Blaine Garelick",
  "Brian Centeno",
  "Jason Lee",
  "Jeffrey Mickolayck",
  "Raul Palomares",
  "Brian Konigsford",
  "John Vega",
  "Joseph Asare",
  "Milon Horton",
  "Paul Portuese",
  "Roberto Chairez",
  "Sean Powell",
  "Roy Alfaro",
  "Sam Minor",
  "Sirtaj Iqbal",
  "Zachary Ball",
  "Charlie Tables",
  "Christian Rembert",
  "Gerald Williams",
  "Jacob Manley",
  "Justo Valmayor",
  "Levi Pembroke",
  "Alex Murillo",
  "Andrew Westberg",
  "Andrzej Klejka",
  "Cocoa Dunner",
  "Fabian Rosado",
  "Joshua Tapia",
  "Parth Patel",
  "Raj Patel",
  "Raphael Rodea",
  "Romeo Patino",
  "Sanjay Patel",
  "Talha Shakil",
  "Emmanuel Metuge",
  "Justin Emerson",
  "Karim Camara",
  "Keith Barbo",
  "Romaric Guidigansou",
  "Royal Durant",
  "Suman Khanal",
  "Timothy Days",
  "Vadim Korshunov",
  "Adrian Montes",
  "Daniel Mahoney",
  "Don Bellione",
  "Evan Pearson",
  "Fernando Cocio Jr.",
  "Greg Silva",
  "Isaac Johnson",
  "Jordan Foster",
  "Matt Arnold",
  "Sal Sanchez",
  "Tommy Vereen",
  "AhmadMuneer Seddiqi",
  "Brett Edwards",
  "Gilman Yee",
  "Joshua Pascual",
  "Kevin Poso",
  "Seatty Than",
  "Aaron Schmidt (C)",
  "Adam Cicalo (C)",
  "Ahmad Dunson (C)",
  "Andrew Dennis (C)",
  "Brad Schroeder",
  "Brandon Jang",
  "Bronson Urmston",
  "Caleb Ray (C)",
  "Chris Norland (C)",
  "Chris Palmer",
  "Dan Eldridge",
  "Devin Cobert",
  "Duy Duong (C)",
  "Dylan Rowe (C)",
  "Edward Bird (C)",
  "Eli Fernandes",
  "Eric Ekstrand",
  "George Barnett (C)",
  "Gerrit Schut (C)",
  "Godfrey Aristil (C)",
  "Gus Azure",
  "Ibrahim Diallo",
  "Isaiah McCants",
  "Jabari Thompson",
  "Jason Bittner",
  "Jonathan Hayes (C)",
  "Jose Cruz Acosta (C)",
  "Joshua Langford (C)",
  "Justin Scherer",
  "Kaden Hill",
  "Kevin Sanchez (C)",
  "Naveem Thallam (C)",
  "Raymond Wood (C)",
  "Rohan Monagoni",
  "Stephane Diakalenga (C)",
  "Steven Schidrich",
  "Sylvestor Anigbo (C)",
  "Terence Jones (C)",
  "Travanti Ross (C)",
  "Vincent Doxie (C)",
  "Zacarias Servin (C)",
  "Zachary Schroeder",
  "Allen Cayen",
  "Arun Joseph",
  "Benjamin Tompkins",
  "Jon Lawson",
  "Joseph Parvu",
  "Justin Handley",
  "Nishant Saini",
  "Ramtin Alikhani",
  "Sandeep Singh",
  "Yadi Saggu",
  "Alfred Nyamusa",
  "Anthony Henry",
  "Bill Alfano",
  "Christopher Muckle",
  "Corey Miller",
  "David Tang",
  "Ibrahima Barry",
  "James Logan",
  "Kinzi Stone",
  "Marc Valentine",
  "Merfred Ngwe",
  "Ram Singh",
  "Richard Mbunwe",
  "Ronald Irving",
  "Samuel Williams",
  "Syjngjen Towner",
  "Tyler Darden",
  "Aaron Edwards",
  "Andreas Macavei",
  "Chad Vandemerwe",
  "Daniel Gardner",
  "Daniel Marquez",
  "Gabriel Wade",
  "Jason Bright",
  "Jay Brown",
  "Jordyn Compehos",
  "Mike Bounthong",
  "Toma Kovacevich",
  "Alex Olsen",
  "Casey Diotte",
  "Chakiel Crumsey",
  "Darren Strawbridge",
  "Dylan Jayce",
  "Matt Michanowicz",
  "Mitch Henley",
  "Rene Tamez",
  "Steaphon Starks-Harris",
  // EU DCT additions
  "Amal Paul",
  "Aravinda Sopinti",
  "Basilio Saez Sanchez",
  "Béatrice Cazenave",
  "Christian Campo",
  "Damien Henry",
  "Dmytro Intelehator",
  "Dulari Imalka",
  "Eduardo Allende",
  "Fabrizio Fermo",
  "Farhan Shahzad",
  "Gabriele Magliano",
  "Hassan Syed",
  "Ilie Puiu",
  "Imran laghari",
  "Ivan Mendez Vila",
  "Jack O'Doherty",
  "Jaffin George",
  "Jeremy Yeatman",
  "Joe Horton",
  "Jonny Callow",
  "Josué Mariblanca López",
  "Juan De la Torre",
  "Kamil Wegrzyk",
  "Kris Lujanovic",
  "Liam Rabey",
  "Marcos Montoro Riestra",
  "Marek Krzesiak",
  "Marlon Sevilla",
  "Mohammed Belkassmi El Boukyly",
  "Mostafa Abbas",
  "Muhammad Mamun",
  "Muizz Opebi",
  "Nathan Francis",
  "Nauman Khan",
  "Nicolai Mass",
  "Nipun Peiris",
  "Patryk Kedzierski",
  "Rabih Hamze",
  "Salman Muhammad",
  "Sam Howlett",
  "Sergio Mendoza",
  "Shashi Fernando",
  "Stephen Delaney",
  "Syed Muhammad Ali",
  "Tenzin Ngodup",
  "Teodor Nikolov",
  "Thenujan Prabaharan",
  "Tish Gramatov",
  "Tomas Parzianello",
  "Tunde Olabode",
  "Victor Ponce Mayo",
  "Vito Koleganov",
  "Waseem ahmed Bhatti",
  "Wieslaw Umerski",
  "Yoann Herembourg",
]);

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
      }
      if (srvRes.ok) {
        const srvData = await srvRes.json();
        // Merge backend server counts into SERVER_COUNTS at runtime
        Object.assign(SERVER_COUNTS, srvData.servers || {});
      }

      // ── Fetch tickets from backend ──
      setFetchProgress({ done:0, total:null, status:"Fetching tickets from database..." });
      const ticketRes = await fetch(`${apiBase}/api/tickets`);
      if (!ticketRes.ok) throw new Error(`Server returned HTTP ${ticketRes.status}`);
      const ticketData = await ticketRes.json();
      const allTickets = ticketData.tickets || [];

      setFetchProgress({ done: allTickets.length, total: allTickets.length, status:"Processing tickets..." });

      const strField = val => {
        if (!val) return "";
        const vals = Array.isArray(val) ? val : [val];
        const strs = vals.map(v => v?.toString().trim()).filter(Boolean);
        if (!strs.length) return "";
        for (const s of strs) { if (canonicalize(s)) return s; }
        return strs[0];
      };

      const parsed = allTickets.map(ticket => {
        // Tickets from backend have normalized fields + optional raw Jira payload
        const f = ticket.raw?.fields || {};
        return normalizeIssue({
          key:       ticket.key       || "",
          summary:   ticket.summary   || f.summary || "",
          assignee:  ticket.assignee  || f.assignee?.displayName || "Unassigned",
          reporter:  ticket.reporter  || f.reporter?.displayName || "",
          priority:  ticket.priority  || f.priority?.name        || "Medium",
          status:    ticket.status    || f.status?.name          || "",
          issueType: ticket.issue_type || f.issuetype?.name      || "",
          created:   (ticket.created_at || f.created || "").substring(0, 10),
          resolved:  ticket.resolved_at || f.resolutiondate || null,
          location:  ticket.location  || strField(f["customfield_11810"]) || "Unknown",
          assetDC:   strField(f["customfield_10194"]),
          sla:       f["customfield_10020"] || null,
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
        <div style={{ fontSize:22, fontWeight:800, color:"#f1f5f9", marginBottom:4 }}>🏭 DCOPS Jira Dashboard</div>
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
          <div style={{ fontSize:20, fontWeight:800, color:"#f1f5f9" }}>🏭 DCOPS Jira Dashboard</div>
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
        {[["planning","📊 Planning"],["matrix","🧮 Matrix"],["location","📍 By Site"],["tickets","📋 Tickets"]].map(([t,l])=>(
          <button key={t} onClick={()=>setActiveTab(t)} style={tabBtn(t)}>{l}</button>
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
    </div>
  );
}
