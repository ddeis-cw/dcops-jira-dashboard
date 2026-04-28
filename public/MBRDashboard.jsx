import { useState, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

// ─── Site Labels ──────────────────────────────────────────────
const SITE_LABELS = {

  "CA-GAL":"Cambridge, Ontario",
  "DK-SVL":"Skovlunde, Denmark",
  "ES-AVQ":"Rivabellosa, Spain",
  "ES-BCN":"Barcelona, Spain",
  "GB-CWY":"Crawley, England",
  "GB-PPL":"London (Docklands)",
  "NO-OVO":"Øvrebø, Norway",
  "NO-POR":"Porsgrunn, Norway",
  "SE-FAN":"Falun, Sweden",
  "SE-SKH":"Stockholm, Sweden",
  "US-AAI":"Alpharetta, GA",
  "US-ARQ":"Marble, NC",
  "US-ATL":"Atlanta, GA",
  "US-AUS":"Austin, TX",
  "US-BVI":"Breinigsville, PA",
  "US-CDZ":"Caledonia, MI",
  "US-CHI":"Chicago, IL",
  "US-CLY":"Chantilly, VA",
  "US-CMH":"Columbus, OH",
  "US-CSZ":"Chester, VA",
  "US-CVG":"Cincinnati, OH",
  "US-CVY":"Clarksville, VA",
  "US-DAL":"Dallas, TX",
  "US-DGV":"Douglasville, GA",
  "US-DNN":"Dalton, GA",
  "US-DTN":"Denton, TX",
  "US-EVI":"Elk Grove Village, IL",
  "US-EWS":"East Windsor, NJ",
  "US-HIO":"Hillsboro, OR",
  "US-HMN":"Hammond, IN",
  "US-KWO":"Kenilworth, NJ",
  "US-LAS":"Las Vegas, NV",
  "US-LBB":"Afton, TX",
  "US-LHS":"Lithia Springs, GA",
  "US-LNB":"Lebanon, OH",
  "US-LNS":"Lancaster, PA",
  "US-LOE":"Lowell, MA",
  "US-LYF":"Lynnwood, WA",
  "US-LZL":"Ellendale, ND",
  "US-MKO":"Muskogee, OK",
  "US-MSC":"Mesa, AZ",
  "US-NKQ":"Newark, CA",
  "US-NNN":"Centennial, CO",
  "US-OBG":"Orangeburg, NY",
  "US-PHX":"Phoenix, AZ",
  "US-PLZ":"Plano, TX",
  "US-PPY":"Parsippany, NJ",
  "US-QNC":"Quincy, WA",
  "US-RIN":"Richardson, TX",
  "US-RRX":"Round Rock, TX",
  "US-SJC":"San Jose, CA",
  "US-SKY":"Sandusky, OH",
  "US-SPK":"Sparks, NV",
  "US-SVG":"Suwanee, GA",
  "US-TUZ":"Tucson, AZ",
  "US-VO2":"Volo, IL",
  "US-WCI":"West Chicago, IL",
  "US-WJQ":"Weehawken, NJ",
};

// ─── DC Alias ─────────────────────────────────────────────────
const DC_ALIAS = {
  "US-RNO":"US-SPK","US-LLZ":"US-LZL","US-PDX":"US-HIO","US-PHL":"US-BVI",
  "US-HIO01":"US-HIO","US-HIO02":"US-HIO","US-HIO03":"US-HIO","US-HIO04":"US-HIO",
  "US-ARQ01":"US-ARQ","US-DTN01":"US-DTN","US-PLZ01":"US-PLZ","US-PLZ02":"US-PLZ",
  "US-VO201":"US-VO2","US-VO":"US-VO2","US-LZL01":"US-LZL",
  "US-SPK01":"US-SPK","US-SPK02":"US-SPK","US-SPK03":"US-SPK",
  "US-CSZ01":"US-CSZ","US-CSZ02":"US-CSZ","US-CVY01":"US-CVY",
  "US-LAS01":"US-LAS","US-LAS02":"US-LAS","US-LAS03":"US-LAS",
  "US-EWS01":"US-EWS","US-CMH01":"US-CMH","US-BVI01":"US-BVI",
  "US-CVG01":"US-CVG","US-LNB01":"US-LNB","US-EVI01":"US-EVI",
  "US-LOE01":"US-LOE","US-LHS01":"US-LHS","US-RIN01":"US-RIN",
  "US-CDZ01":"US-CDZ","US-PHX01":"US-PHX","US-SVG01":"US-SVG",
  "US-AAI01":"US-AAI","US-DNN01":"US-DNN","US-PPY01":"US-PPY",
  "US-WJQ01":"US-WJQ","US-MSC01":"US-MSC","US-MKO01":"US-MKO",
  "US-NNN01":"US-NNN","US-LBB01":"US-LBB","US-QNC01":"US-QNC",
  "US-HMN01":"US-HMN","US-WCI01":"US-WCI","US-LYF01":"US-LYF",
  "US-RRX01":"US-RRX","US-AUS01":"US-AUS","US-SKY01":"US-SKY",
  "US-CLY01":"US-CLY","US-DGV01":"US-DGV","US-NKQ01":"US-NKQ","US-OBG01":"US-OBG",
  "CA-GAL01":"CA-GAL","NO-OVO01":"NO-OVO","SE-FAN01":"SE-FAN",
  "GB-CWY01":"GB-CWY","GB-PPL01":"GB-PPL","ES-BCN01":"ES-BCN","ES-AVQ01":"ES-AVQ",
  "RNO1":"US-SPK","LAS1":"US-LAS","LGA1":"US-WJQ","ORD1":"US-VO2","ORD3":"US-WCI",
  "ATL1":"US-SVG","ATL2":"US-DGV","ATL4":"US-AAI","AUS1":"US-AUS","PDX2":"US-HIO",
  "US-WEST-01A":"US-LAS","US-WEST-02A":"US-PHX","US-WEST-06":"US-HIO","US-WEST-06A":"US-HIO",
  "US-EAST-11A":"US-ARQ","US-CENTRAL-03A":"US-DTN","US-CENTRAL-05A":"US-RIN",
  "US-EAST-04B":"US-CSZ","US-EAST-04A":"US-CSZ",
};

function canonicalize(raw) {
  if (!raw) return null;
  const key = raw.trim().toUpperCase();
  if (key in DC_ALIAS) return DC_ALIAS[key];
  if (key in SITE_LABELS) return key;
  const nd = key.replace(/\d+$/, "");
  if (nd !== key && (nd in DC_ALIAS || nd in SITE_LABELS)) return DC_ALIAS[nd] || nd;
  return null;
}

// ─── Projects ────────────────────────────────────────────────
const PROJECT_LABELS = {
  "service-desk-albatross":    "Albatross",
  "service-desk-eagle":        "Eagle",
  "service-desk-heron":        "Heron",
  "service-desk-osprey":       "Osprey",
  "service-desk-phoenix":      "Phoenix",
  "service-desk-snipecustomer":"SnipeCust",
  "dct-ops":                   "DCT-Ops",
};
const PROJECT_KEYS = Object.keys(PROJECT_LABELS);

// ─── DCT Roster ───────────────────────────────────────────────
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
]);

function resolveLocation(f11810, f10194) {
  const raw = Array.isArray(f11810) ? (f11810[0] || "") : (f11810 || "");
  const prefix = raw.split(/[.:]/)[0];
  return canonicalize(prefix) || canonicalize(raw)
    || canonicalize(Array.isArray(f10194) ? f10194[0] : f10194) || "Other";
}

function getStatusGroup(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("closed") || s.includes("resolved") || s.includes("done")) return "Closed";
  if (s.includes("verification") || s.includes("review")) return "Verification";
  if (s.includes("hold") || s.includes("waiting") || s.includes("pending")) return "On Hold";
  if (s.includes("progress") || s.includes("open") || s.includes("new")) return "In Progress";
  if (s.includes("cancel")) return "Cancelled";
  return "Other";
}

// ─── SLA MTTR parser ─────────────────────────────────────────
// Parses Jira's SLA JSON field (customfield_10020 = Time to resolution)
// Uses Jira's own formula: target ± remaining/breach = actual resolution time
function parseSlaHours(slaField) {
  if (!slaField) return null;
  try {
    const sla = typeof slaField === "string" ? JSON.parse(slaField) : slaField;
    // completedCycles contains the finished SLA for resolved tickets
    const cycles = Array.isArray(sla.completedCycles) ? sla.completedCycles : [];
    if (cycles.length === 0) return null;
    const last = cycles[cycles.length - 1];
    // breachTime or elapsedTime gives us the actual duration in ms
    if (last.elapsedTime?.millis != null) return last.elapsedTime.millis / 3600000;
    if (last.remainingTime?.millis != null) {
      // met: elapsedTime = goal - remaining; breached: goal + |remaining|
      const goalMs = (last.goalDuration?.millis || 0);
      const remMs  = last.remainingTime.millis;
      return Math.abs(goalMs - remMs) / 3600000;
    }
    return null;
  } catch { return null; }
}

function buildMonthOptions() {
  const opts = [];
  const now = new Date("2026-04-08");
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    opts.push({
      label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
      short: d.toLocaleString("en-US", { month: "short", year: "numeric" }),
      start: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`,
      end: end.toISOString().slice(0,10),
    });
  }
  return opts;
}
const MONTH_OPTIONS = buildMonthOptions();

// ─── Colors ───────────────────────────────────────────────────
const C = {
  blue:   "#1b5ec7",
  green:  "#15803d",
  amber:  "#b45309",
  orange: "#c2410c",
  red:    "#b91c1c",
  purple: "#6d28d9",
  slate:  "#475569",
  border: "#cbd5e1",
  bg:     "#f1f5f9",
  card:   "#ffffff",
  text:   "#0f172a",
  muted:  "#64748b",
  light:  "#e2e8f0",
  accent: "#1b5ec7",
};

const STATUS_COLORS = {
  "Closed":"#1d6fe8","Verification":"#ea580c",
  "On Hold":"#7c3aed","In Progress":"#d97706",
  "Cancelled":"#94a3b8","Other":"#cbd5e1",
};

// ─── Copy-to-slide helper ────────────────────────────────────
// ─── PNG Export ───────────────────────────────────────────────
// Loads html2canvas on demand, captures the card at 2x resolution, downloads as PNG
function loadHtml2Canvas() {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) { resolve(window.html2canvas); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload  = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error("Failed to load html2canvas"));
    document.head.appendChild(s);
  });
}

function ExportButton({ targetRef, label }) {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error

  const handleExport = async () => {
    if (!targetRef.current || status === "loading") return;
    setStatus("loading");
    try {
      const h2c = await loadHtml2Canvas();
      // Hide the export button itself before capture
      const btn = targetRef.current.querySelector("[data-export-btn]");
      if (btn) btn.style.visibility = "hidden";

      const canvas = await h2c(targetRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,           // retina-quality — looks sharp pasted into slides
        useCORS: true,
        logging: false,
        removeContainer: true,
      });

      if (btn) btn.style.visibility = "visible";

      // Trigger download
      const slug = label
        ? label.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase()
        : "section";
      const link = document.createElement("a");
      link.download = `dcops_jira_${slug}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      setStatus("done");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      console.error("PNG export failed:", err);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  };

  const bg    = status === "done"  ? "#15803d"
              : status === "error" ? "#b91c1c"
              : "#fff";
  const color = status === "done" || status === "error" ? "#fff" : C.slate;
  const label_text =
      status === "loading" ? "⏳ Exporting…"
    : status === "done"    ? "✓ Saved PNG"
    : status === "error"   ? "⚠ Failed"
    : "⬇ PNG";

  return (
    <button
      data-export-btn
      onClick={handleExport}
      disabled={status === "loading"}
      title={`Export "${label}" as PNG for slides`}
      style={{
        position:"absolute", top:14, right:14,
        background:bg, border:`1px solid ${status==="idle"?C.border:bg}`,
        borderRadius:6, padding:"5px 12px", cursor:status==="loading"?"wait":"pointer",
        fontSize:11, fontWeight:600, color, fontFamily:"system-ui,sans-serif",
        transition:"all .2s", zIndex:10, boxShadow:"0 1px 3px rgba(0,0,0,.08)",
        display:"flex", alignItems:"center", gap:5, userSelect:"none",
      }}>
      {label_text}
    </button>
  );
}

// ─── Section Card ─────────────────────────────────────────────
function Section({ title, subtitle, children, style={} }) {
  const ref = useRef(null);
  return (
    <div ref={ref} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12,
      padding:24, position:"relative", boxShadow:"0 2px 8px rgba(0,0,0,.06)", ...style }}>
      <ExportButton targetRef={ref} label={title}/>
      {title && (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:subtitle?4:16 }}>
          <div style={{ width:3, height:16, background:C.blue, borderRadius:2, flexShrink:0 }}/>
          <div style={{ fontSize:11, fontWeight:700, color:C.slate, letterSpacing:.8,
            textTransform:"uppercase", fontFamily:"system-ui,sans-serif" }}>{title}</div>
        </div>
      )}
      {subtitle && <div style={{ fontSize:12, color:C.muted, marginBottom:16,
        fontFamily:"system-ui,sans-serif", paddingLeft:11 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────
function SiteTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter(p => (p.value||0) > 0);
  const total = filtered.reduce((s,p)=>s+(p.value||0),0);
  return (
    <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px",
      fontSize:12, boxShadow:"0 4px 16px rgba(0,0,0,.12)", fontFamily:"system-ui,sans-serif", minWidth:160 }}>
      <div style={{ fontWeight:700, color:C.text, marginBottom:2 }}>{label}</div>
      <div style={{ color:C.muted, fontSize:11, marginBottom:8 }}>{SITE_LABELS[label]||""} · DCT Closed</div>
      {filtered.map(p=>(
        <div key={p.name} style={{ display:"flex", justifyContent:"space-between", gap:20, color:p.fill, marginBottom:2 }}>
          <span>{p.name}</span><span style={{ fontWeight:700 }}>{(p.value||0).toLocaleString()}</span>
        </div>
      ))}
      <div style={{ borderTop:`1px solid ${C.border}`, marginTop:6, paddingTop:6, display:"flex", justifyContent:"space-between", color:C.text }}>
        <span style={{ fontWeight:600 }}>Total Closed</span><span style={{ fontWeight:700 }}>{total.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function MBRDashboard() {
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[1]);
  const [customStart,   setCustomStart]   = useState("");
  const [customEnd,     setCustomEnd]     = useState("");
  const [useCustom,     setUseCustom]     = useState(false);
  const [dateField,     setDateField]     = useState("created");
  const [proxyUrl,      setProxyUrl]      = useState(window.location.origin);
  const [customJql,     setCustomJql]     = useState("");
  const [useCustomJql,  setUseCustomJql]  = useState(false);
  const [fetchStatus,   setFetchStatus]   = useState("idle");
  const [errorMsg,      setErrorMsg]      = useState("");
  const [tickets,       setTickets]       = useState([]);
  const [progress,      setProgress]      = useState({ done:0, total:null });
  const [showConfig,    setShowConfig]    = useState(false);

  const period = useCustom
    ? { label:`${customStart} → ${customEnd}`, short:`${customStart}–${customEnd}`, start:customStart, end:customEnd }
    : selectedMonth;

  const fetchData = useCallback(async () => {
    if (!period.start || !period.end) return;
    const PAGE = 5000;

    setFetchStatus("fetching"); setErrorMsg(""); setTickets([]); setProgress({ done:0, total:null });

    try {
      // Load live DCT list from employees API
      const empRes = await fetch("/api/employees");
      const empData = empRes.ok ? await empRes.json() : {};
      const liveDct = new Set(empData.dctList || []);
      const allDct = new Set([...DCT_LIST, ...liveDct]);

      const colMap = { created: "created_at", resolutiondate: "resolved_at" };
      const dbField = colMap[dateField] || "created_at";

      const probeParams = new URLSearchParams({
        date_from: period.start, date_to: period.end,
        date_field: dbField, limit: 1, page: 0,
      });
      const probe = await fetch(`/api/tickets?${probeParams}`);
      if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
      const pd = await probe.json();
      const total = pd.total || 0;
      setProgress({ done: 0, total });

      const raw = [];
      const pages = Math.ceil(total / PAGE);
      for (let p = 0; p < pages; p++) {
        const params = new URLSearchParams({
          date_from: period.start, date_to: period.end,
          date_field: dbField, limit: PAGE, page: p,
        });
        const r = await fetch(`/api/tickets?${params}`);
        if (!r.ok) break;
        const d = await r.json();
        raw.push(...(d.tickets || []));
        setProgress({ done: raw.length, total });
      }

      const PROJECT_MAP = {
        'sda': 'service-desk-albatross',
        'sde': 'service-desk-eagle',
        'sdh': 'service-desk-heron',
        'sdo': 'service-desk-osprey',
        'sdp': 'service-desk-phoenix',
        'sds': 'service-desk-snipecustomer',
        'do':  'dct-ops',
      };

      const parsed = raw.map(t => {
        const slaHours = t.sla_seconds ? t.sla_seconds / 3600 : null;
        let fallbackHours = null;
        if (t.resolved_at && t.created_at) {
          const h = (new Date(t.resolved_at) - new Date(t.created_at)) / 3600000;
          if (h >= 0 && h <= 720) fallbackHours = h;
        }
        return {
          key:             t.key || "",
          summary:         t.summary || "",
          assignee:        t.assignee || "Unassigned",
          isDct:           allDct.has(t.assignee || ""),
          project:         PROJECT_MAP[t.project] || t.project || "unknown",
          projectName:     PROJECT_MAP[t.project] || t.project || "",
          projectKey:      (t.key || "").split("-")[0].toUpperCase(),
          status:          t.status || "",
          group:           getStatusGroup(t.status || ""),
          priority:        t.priority || "Medium",
          issueType:       t.issue_type || "",
          created:         (t.created_at || "").slice(0, 10),
          resolved:        t.resolved_at || null,
          location:        (t.location || "Other").replace(/\d{2}(-.*)?$/, "") || "Other",
          mttrHours:       slaHours ?? fallbackHours,
          hasSla:          slaHours != null,
          maintType:       t.maintenance_type || null,
          hasServerAsset:  false,
          hasNetworkAsset: false,
        };
      }).filter(t => t.key);

      const projCounts = {};
      parsed.forEach(t => { projCounts[t.project] = (projCounts[t.project]||0)+1; });
      console.log("[MBR] Project breakdown:", projCounts);
      console.log("[MBR] DCT tickets:", parsed.filter(t=>t.isDct).length, "of", parsed.length);

      setTickets(parsed);
      setFetchStatus("done");
    } catch(e) {
      setErrorMsg(e.message);
      setFetchStatus("error");
    }
  }, [period, dateField]);

  // ── Derived metrics ─────────────────────────────────────────
  const metrics = useMemo(() => {
    if (!tickets.length) return null;

    const statusMap = {};
    tickets.forEach(t => { statusMap[t.group]=(statusMap[t.group]||0)+1; });

    const bySiteRaw = {};
    tickets.forEach(t => {
      if (!(t.location in SITE_LABELS) && t.location !== "Other") return;
      if (!bySiteRaw[t.location]) bySiteRaw[t.location] = { Closed:0,Verification:0,"On Hold":0,"In Progress":0,Cancelled:0,total:0 };
      bySiteRaw[t.location][t.group]=(bySiteRaw[t.location][t.group]||0)+1;
      bySiteRaw[t.location].total++;
    });
    const siteData = Object.entries(bySiteRaw).filter(([s])=>s!=="Other")
      .sort((a,b)=>b[1].total-a[1].total).map(([site,c])=>({site,...c}));

    // Daily/weekly trend
    const dayMap={}, weekMap={};
    tickets.forEach(t => {
      const d=t.created; if(!d) return;
      if(!dayMap[d]) dayMap[d]={date:d,Total:0,Closed:0,Open:0};
      dayMap[d].Total++; if(t.group==="Closed") dayMap[d].Closed++; else dayMap[d].Open++;
      const dt=new Date(t.created); if(isNaN(dt)) return;
      const day=dt.getDay(); const mon=new Date(dt); mon.setDate(dt.getDate()-(day===0?6:day-1));
      const wk=mon.toISOString().slice(0,10);
      if(!weekMap[wk]) weekMap[wk]={week:wk,Total:0,Closed:0,Open:0};
      weekMap[wk].Total++; if(t.group==="Closed") weekMap[wk].Closed++; else weekMap[wk].Open++;
    });
    const trend=Object.values(dayMap).sort((a,b)=>a.date.localeCompare(b.date));
    const weekTrend=Object.values(weekMap).sort((a,b)=>a.week.localeCompare(b.week));

    // MTTR — use SLA field where available, fallback to wall-clock
    // Jira formula: sum of individual ticket resolution times ÷ count
    const mttrSums={}, mttrCounts={}, globalS={hours:0,count:0};
    let slaCount=0;
    tickets.forEach(t => {
      if (t.group !== "Closed" || t.mttrHours == null) return;
      if (t.hasSla) slaCount++;
      mttrSums[t.location]=(mttrSums[t.location]||0)+t.mttrHours;
      mttrCounts[t.location]=(mttrCounts[t.location]||0)+1;
      globalS.hours+=t.mttrHours; globalS.count++;
    });
    const mttrBySite={};
    Object.keys(mttrSums).forEach(s=>{mttrBySite[s]=mttrSums[s]/mttrCounts[s];});
    const globalMttr=globalS.count>0?globalS.hours/globalS.count:null;
    const mttrSource=slaCount>0?`SLA field (${slaCount} tickets)`:"Wall-clock (no SLA field)";

    const typeMap={};
    tickets.forEach(t=>{typeMap[t.issueType]=(typeMap[t.issueType]||0)+1;});

    // ── Maintenance Type breakdown (DCT tickets only) ──────────
    const maintMap={};
    tickets.filter(t=>t.isDct).forEach(t=>{
      const mt = t.maintType || "Unspecified";
      if(!maintMap[mt]) maintMap[mt]={type:mt,total:0,closed:0};
      maintMap[mt].total++;
      if(t.group==="Closed") maintMap[mt].closed++;
    });
    const maintData = Object.values(maintMap)
      .sort((a,b)=>b.total-a.total)
      .slice(0,12);

    // ── Verification backlog ────────────────────────────────────
    // Tickets in Verification = completed by DCT, awaiting sign-off
    const verificationCount = tickets.filter(t=>
      t.isDct && (t.status||"").toLowerCase().includes("verif")
    ).length;
    const onHoldCount = tickets.filter(t=>
      t.isDct && (t.status||"").toLowerCase().includes("hold")
    ).length;

    // ── Asset type split (server vs network) ───────────────────
    let assetServer=0, assetNetwork=0, assetBoth=0, assetNone=0;
    tickets.filter(t=>t.isDct).forEach(t=>{
      if(t.hasServerAsset && t.hasNetworkAsset) assetBoth++;
      else if(t.hasServerAsset)  assetServer++;
      else if(t.hasNetworkAsset) assetNetwork++;
      else assetNone++;
    });
    const assetPieData=[
      {name:"Server",    value:assetServer,  color:"#1b5ec7"},
      {name:"Network",   value:assetNetwork, color:"#15803d"},
      {name:"Both",      value:assetBoth,    color:"#b45309"},
      {name:"Unlinked",  value:assetNone,    color:"#94a3b8"},
    ].filter(d=>d.value>0);

    // ── Open backlog aging ──────────────────────────────────────
    const today = new Date("2026-04-08");
    const ageBuckets={"<7d":0,"7–30d":0,"30–90d":0,">90d":0};
    tickets.forEach(t=>{
      if(t.group==="Closed" || t.status?.toLowerCase().includes("hold")) return;
      if(!t.created) return;
      const ageDays = Math.floor((today - new Date(t.created)) / 86400000);
      if(ageDays < 7)        ageBuckets["<7d"]++;
      else if(ageDays < 30)  ageBuckets["7–30d"]++;
      else if(ageDays < 90)  ageBuckets["30–90d"]++;
      else                   ageBuckets[">90d"]++;
    });
    const agingData = Object.entries(ageBuckets).map(([label,count])=>({label,count}));

    // ── Avg time in each status (hours) ────────────────────────
    // Approximated from ticket timeline using transition markers
    // Since we don't have time_in_status_secs in the API, we measure:
    //   - In Progress time: created → resolved (minus estimated wait)
    //   - Verification time: proxy from tickets currently in Verification
    const statusTimeMap={};
    tickets.forEach(t=>{
      const g = t.group || "Other";
      if(!statusTimeMap[g]) statusTimeMap[g]={total:0,count:0};
      if(t.mttrHours) { statusTimeMap[g].total+=t.mttrHours; statusTimeMap[g].count++; }
    });
    const statusTimeData = Object.entries(statusTimeMap)
      .filter(([,v])=>v.count>0)
      .map(([status,v])=>({status, avgHours:+(v.total/v.count).toFixed(1)}))
      .sort((a,b)=>b.avgHours-a.avgHours);
    const typeData=Object.entries(typeMap).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count])=>({name,count}));
    const pieData=Object.entries(statusMap).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));

    // ── DCT-only metrics ──────────────────────────────────────
    const dctTickets = tickets.filter(t => t.isDct);
    const dctClosed  = dctTickets.filter(t => t.group === "Closed").length;

    // By project: total and DCT breakdown
    const byProject = {};
    PROJECT_KEYS.forEach(p => { byProject[p] = { total:0, dct:0, closed:0, dctClosed:0, label:PROJECT_LABELS[p] }; });
    tickets.forEach(t => {
      // t.project is now one of the 6 canonical PROJECT_KEYS strings
      const p = PROJECT_KEYS.includes(t.project) ? t.project : null;
      if (!p) return;
      byProject[p].total++;
      if (t.isDct) byProject[p].dct++;
      if (t.group === "Closed") { byProject[p].closed++; if(t.isDct) byProject[p].dctClosed++; }
    });
    const projectData = PROJECT_KEYS.map(p => ({ key:p, ...byProject[p] }))
      .filter(p => p.total > 0)
      .sort((a,b) => b.total - a.total);

    // All closed tickets per site broken down by Jira project (all assignees)
    const dctBySiteRaw = {};
    tickets.forEach(t => {
      if (!(t.location in SITE_LABELS)) return;
      if (!dctBySiteRaw[t.location]) {
        const row = { site:t.location, total:0 };
        PROJECT_KEYS.forEach(p => { row[PROJECT_LABELS[p]] = 0; });
        dctBySiteRaw[t.location] = row;
      }
      if (t.group === "Closed") {
        const label = PROJECT_LABELS[t.project] || null;
        if (label) dctBySiteRaw[t.location][label]++;
      }
      dctBySiteRaw[t.location].total++;
    });
    const dctSiteData = Object.entries(dctBySiteRaw)
      .sort((a,b)=>b[1].total-a[1].total)
      .map(([,v])=>v);

    const closed=statusMap["Closed"]||0;
    const fmtMttr=h=>!h?"—":h<1?`${Math.round(h*60)}m`:h<24?`${h.toFixed(1)}h`:`${(h/24).toFixed(1)}d`;
    const mttrColor=h=>!h?C.muted:h<=48?C.green:h<=120?C.amber:C.red;

    return { statusMap, siteData, trend, weekTrend, mttrBySite, globalMttr, typeData, pieData,
      maintData, verificationCount, onHoldCount, assetPieData, agingData, statusTimeData,
      closed, closedPct:((closed/tickets.length)*100).toFixed(1),
      openPct:(((statusMap["In Progress"]||0)/tickets.length)*100).toFixed(1),
      holdPct:(((statusMap["On Hold"]||0)/tickets.length)*100).toFixed(1),
      activeSites:siteData.length, fmtMttr, mttrColor, mttrSource,
      dctTickets, dctClosed, dctPct:tickets.length?((dctClosed/tickets.length)*100).toFixed(1):"0",
      projectData, dctSiteData, totalDct:dctTickets.length };
  }, [tickets]);

  const headerRef = useRef(null);
  const kpiRef    = useRef(null);

  const today = new Date("2026-04-08").toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif", color:C.text }}>

      {/* ── HEADER ── */}
      <div ref={headerRef} style={{ background:"#fff", borderBottom:`1px solid ${C.border}`, padding:"18px 32px 16px",
        boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <div style={{ width:3, height:24, background:C.blue, borderRadius:2 }}/>
              <div style={{ fontSize:11, color:C.blue, fontWeight:700, letterSpacing:2, textTransform:"uppercase" }}>CoreWeave · Business Owner: DC OPS</div>
            </div>
            <h1 style={{ fontSize:26, fontWeight:800, color:C.text, margin:0, letterSpacing:-.5 }}>Data Center Operations Tickets</h1>
            <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>
              {useCustomJql && customJql.trim() ? <span style={{color:C.amber}}>⚠ Custom JQL</span> : period.label}
              {" · "}
              {dateField==="created" ? "Created Date" : "Resolved Date"}
              {tickets.length>0 && <span style={{color:C.blue, marginLeft:10}}>● {tickets.length.toLocaleString()} tickets</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:11, color:C.muted }}>Generated {today}</span>
            <button onClick={()=>window.print()} style={{ background:"#fff", border:`1px solid ${C.border}`,
              color:C.slate, borderRadius:8, padding:"8px 14px", cursor:"pointer", fontSize:12 }}>
              🖨 Print
            </button>
            <button onClick={()=>setShowConfig(v=>!v)} style={{ background:C.light, border:`1px solid ${C.border}`, color:C.muted, borderRadius:8, padding:"8px 14px", cursor:"pointer", fontSize:12 }}>
              ⚙ Config
            </button>
            <button onClick={fetchData} disabled={fetchStatus==="fetching"}
              style={{ background:fetchStatus==="fetching"?C.light:C.blue, border:"none", color:"#fff", borderRadius:8, padding:"8px 20px", cursor:fetchStatus==="fetching"?"not-allowed":"pointer", fontSize:12, fontWeight:700 }}>
              {fetchStatus==="fetching" ? `${progress.done.toLocaleString()}${progress.total?` / ${progress.total.toLocaleString()}`:""}…` : "▶ Fetch Data"}
            </button>
          </div>
        </div>

        {/* Config */}
        {showConfig && (
          <div style={{ marginTop:16, display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end",
            paddingTop:16, borderTop:`1px solid ${C.border}` }}>
            <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>Proxy URL</span>
              <input value={proxyUrl} onChange={e=>setProxyUrl(e.target.value)}
                style={{ background:"#fff", border:`1px solid ${C.border}`, color:C.text, borderRadius:6, padding:"6px 10px", fontSize:12, width:220 }}/>
            </label>
            <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>Date Field</span>
              <select value={dateField} onChange={e=>setDateField(e.target.value)}
                style={{ background:"#fff", border:`1px solid ${C.border}`, color:C.text, borderRadius:6, padding:"6px 10px", fontSize:12 }}>
                <option value="created">Created Date (matches Jira Analytics)</option>
                <option value="resolved">Resolved Date</option>
              </select>
            </label>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              <span style={{ fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>Period Mode</span>
              <div style={{ display:"flex", gap:4 }}>
                <button onClick={()=>setUseCustom(false)} style={{ background:!useCustom?C.blue:"#fff", border:`1px solid ${!useCustom?C.blue:C.border}`, color:!useCustom?"#fff":C.muted, borderRadius:6, padding:"6px 10px", cursor:"pointer", fontSize:12 }}>By Month</button>
                <button onClick={()=>setUseCustom(true)}  style={{ background:useCustom?C.blue:"#fff",  border:`1px solid ${useCustom?C.blue:C.border}`,  color:useCustom?"#fff":C.muted,  borderRadius:6, padding:"6px 10px", cursor:"pointer", fontSize:12 }}>Custom Range</button>
              </div>
            </div>
            {!useCustom ? (
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>Month</span>
                <select value={selectedMonth.label} onChange={e=>setSelectedMonth(MONTH_OPTIONS.find(m=>m.label===e.target.value)||MONTH_OPTIONS[0])}
                  style={{ background:"#fff", border:`1px solid ${C.border}`, color:C.text, borderRadius:6, padding:"6px 10px", fontSize:12 }}>
                  {MONTH_OPTIONS.map(m=><option key={m.label}>{m.label}</option>)}
                </select>
              </label>
            ) : (
              <>
                <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>Start</span>
                  <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)}
                    style={{ background:"#fff", border:`1px solid ${C.border}`, color:C.text, borderRadius:6, padding:"6px 10px", fontSize:12 }}/>
                </label>
                <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <span style={{ fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>End</span>
                  <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)}
                    style={{ background:"#fff", border:`1px solid ${C.border}`, color:C.text, borderRadius:6, padding:"6px 10px", fontSize:12 }}/>
                </label>
              </>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:4, flex:"0 0 100%" }}>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:10, color:C.muted, letterSpacing:1, textTransform:"uppercase" }}>Custom JQL</span>
                <button onClick={()=>setUseCustomJql(v=>!v)} style={{ background:useCustomJql?C.blue:"#fff", border:`1px solid ${useCustomJql?C.blue:C.border}`, color:useCustomJql?"#fff":C.muted, borderRadius:4, padding:"2px 8px", cursor:"pointer", fontSize:11 }}>
                  {useCustomJql ? "ON" : "OFF"}
                </button>
                <span style={{ fontSize:11, color:C.muted }}>Paste Jira Analytics JQL to match exactly</span>
              </div>
              {useCustomJql && (
                <textarea value={customJql} onChange={e=>setCustomJql(e.target.value)} rows={3}
                  placeholder={`project = dct-ops AND created >= "${period.start}" AND created <= "${period.end}" ORDER BY created DESC`}
                  style={{ background:"#fff", border:`1px solid ${C.blue}`, color:C.text, borderRadius:6, padding:"8px 10px", fontSize:12, fontFamily:"monospace", width:"100%", resize:"vertical" }}/>
              )}
            </div>
          </div>
        )}
        {fetchStatus==="error" && <div style={{ marginTop:12, color:C.red, fontSize:12, background:"#fef2f2", border:"1px solid #fecaca", borderRadius:6, padding:"8px 12px" }}>⚠ {errorMsg}</div>}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          button, [data-noprint] { display: none !important; }
          body { background: white; }
          * { box-shadow: none !important; }
          .page-break { page-break-before: always; }
        }
        @media screen {
          * { box-sizing: border-box; }
        }
      `}</style>

      {/* ── IDLE ── */}
      {fetchStatus==="idle" && (
        <div style={{ textAlign:"center", padding:"100px 20px", color:C.muted }}>
          <div style={{ fontSize:52, marginBottom:20 }}>📊</div>
          <div style={{ fontSize:18, color:C.slate, marginBottom:8 }}>Select a period and click Fetch Data</div>
          <div style={{ fontSize:13 }}>Proxy must be running · Default scope: all 6 service desk projects</div>
        </div>
      )}

      {/* ── FETCHING ── */}
      {fetchStatus==="fetching" && (
        <div style={{ padding:"60px 32px", textAlign:"center" }}>
          <div style={{ maxWidth:440, margin:"0 auto" }}>
            <div style={{ fontSize:14, color:C.muted, marginBottom:14 }}>Fetching tickets for {period.label}…</div>
            <div style={{ background:C.light, borderRadius:100, height:6, overflow:"hidden" }}>
              <div style={{ height:"100%", background:C.blue, borderRadius:100,
                width:`${progress.total?Math.round(progress.done/progress.total*100):30}%`, transition:"width .4s" }}/>
            </div>
            <div style={{ fontSize:12, color:C.muted, marginTop:10 }}>
              {progress.done.toLocaleString()} {progress.total?`of ${progress.total.toLocaleString()} tickets`:""} fetched
            </div>
          </div>
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {fetchStatus==="done" && metrics && (
        <div style={{ padding:"24px 32px" }}>

          {/* KPI Row */}
          <div ref={kpiRef} style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
            {[
              { label:"Total Tickets",   val:tickets.length.toLocaleString(), color:C.blue,   icon:"🎫" },
              { label:"Closed",          val:`${metrics.closedPct}%`,          color:C.green,  icon:"✅" },
              { label:"In Progress",     val:`${metrics.openPct}%`,           color:C.amber,  icon:"🔄" },
              { label:"On Hold",         val:`${metrics.holdPct}%`,           color:C.purple, icon:"⏸" },
              { label:"Avg MTTR",        val:metrics.fmtMttr(metrics.globalMttr), color:C.orange, icon:"⏱" },
              { label:"Active Sites",    val:metrics.activeSites,             color:C.blue,   icon:"🌐" },
              { label:"DCT Tickets",     val:metrics.totalDct.toLocaleString(), color:C.purple, icon:"🔧" },
              { label:"DCT Closed",      val:`${metrics.dctPct}%`,            color:C.green,  icon:"✅" },
            ].map(k=>(
              <div key={k.label} style={{ background:C.card, border:`1px solid ${C.border}`,
                borderRadius:12, padding:"18px 22px", flex:1, minWidth:110,
                boxShadow:"0 2px 8px rgba(0,0,0,.06)", borderTop:`3px solid ${k.color}` }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:8, fontWeight:600,
                  letterSpacing:.8, textTransform:"uppercase" }}>{k.icon} {k.label}</div>
                <div style={{ fontSize:28, fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* Row 1: DCT Closed Tickets by Site, colored by Project */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:16, marginBottom:16, alignItems:"start" }}>
            <Section title="Ticket Volume · By Project" subtitle={`${period.label} · all tickets`}>
              {metrics.projectData.filter(p=>p.total>0).map((p,i) => {
                const maxTotal = Math.max(...metrics.projectData.map(x=>x.total));
                const closePct = p.total ? Math.round(p.closed/p.total*100) : 0;
                const pc = closePct>=90?C.green:closePct>=70?C.amber:C.red;
                const colors = [C.blue,C.teal,C.purple,C.orange||'#f97316',C.red,C.green,C.slate];
                const barColor = colors[i % colors.length];
                return (
                  <div key={p.key} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <div style={{ width:130, fontSize:11, fontWeight:600, color:C.text, textAlign:'right', flexShrink:0 }}>{p.label}</div>
                    <div style={{ flex:1, background:C.light, borderRadius:3, height:18, position:'relative' }}>
                      <div style={{ height:'100%', borderRadius:3, background:barColor, width:`${Math.round(p.total/maxTotal*100)}%`, opacity:.85 }}/>
                      <div style={{ height:'100%', borderRadius:3, background:barColor, width:`${Math.round(p.closed/maxTotal*100)}%`, position:'absolute', top:0, left:0, opacity:1 }}/>
                    </div>
                    <div style={{ width:70, fontSize:11, color:C.text, flexShrink:0 }}>{p.total.toLocaleString()} total</div>
                    <div style={{ width:60, fontSize:11, color:pc, fontWeight:700, flexShrink:0 }}>{closePct}% closed</div>
                  </div>
                );
              })}
              <div style={{ fontSize:10, color:C.slate, marginTop:8 }}>
                Darker bar = closed tickets · lighter bar = total tickets
              </div>
            </Section>

            <Section title="Closed Tickets · By Site &amp; Project" subtitle={`${metrics.dctSiteData.length} sites · ${period.label} · all projects`}>
              <ResponsiveContainer width="100%" height={Math.max(300, metrics.dctSiteData.length * 26)}>
                <BarChart data={metrics.dctSiteData} layout="vertical" margin={{ left:0, right:50, top:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.light} horizontal={false}/>
                  <XAxis type="number" tick={{ fill:C.muted, fontSize:11 }} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="site" tick={{ fill:C.slate, fontSize:11 }} width={72} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, fontSize:12, borderRadius:8 }}/>
                  <Legend wrapperStyle={{ fontSize:11, color:C.muted, paddingTop:12 }}/>
                  <Bar dataKey="Albatross"  stackId="a" fill="#1b5ec7" name="Albatross"/>
                  <Bar dataKey="Eagle"      stackId="a" fill="#15803d" name="Eagle"/>
                  <Bar dataKey="Heron"      stackId="a" fill="#0891b2" name="Heron"/>
                  <Bar dataKey="Osprey"     stackId="a" fill="#b45309" name="Osprey"/>
                  <Bar dataKey="Phoenix"    stackId="a" fill="#c2410c" name="Phoenix"/>
                  <Bar dataKey="SnipeCust"  stackId="a" fill="#6d28d9" name="SnipeCust"/>
                  <Bar dataKey="DCT-Ops"    stackId="a" fill="#0e7490" name="DCT-Ops" radius={[0,3,3,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Section>

            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* Donut */}
              <Section title="Global KPIs · Tickets by Status" subtitle="">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={metrics.pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={76} dataKey="value" paddingAngle={2}>
                      {metrics.pieData.map((e,i)=><Cell key={i} fill={STATUS_COLORS[e.name]||C.light}/>)}
                    </Pie>
                    <text x="50%" y="44%" textAnchor="middle" fill={C.text} fontSize={24} fontWeight={800}>{tickets.length.toLocaleString()}</text>
                    <text x="50%" y="57%" textAnchor="middle" fill={C.muted} fontSize={11}>Tickets</text>
                    <Tooltip formatter={(v,n)=>[v.toLocaleString(),n]} contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, fontSize:12 }}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {metrics.pieData.map(d=>(
                    <div key={d.name} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                      <span style={{ color:STATUS_COLORS[d.name]||C.muted }}>● {d.name}</span>
                      <span style={{ color:C.muted }}>{((d.value/tickets.length)*100).toFixed(1)}% <span style={{color:C.slate}}>({d.value.toLocaleString()})</span></span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:12, padding:"8px 10px", background:C.light, borderRadius:6, fontSize:10, color:C.muted }}>
                  MTTR source: {metrics.mttrSource}
                </div>
              </Section>

              {/* Top issue types */}
              <Section title="Top Issue Types" subtitle="">
                {metrics.typeData.map((t,i)=>(
                  <div key={t.name} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:10, color:C.muted, width:16, textAlign:"right" }}>{i+1}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                        <span style={{ fontSize:11, color:C.text, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name}</span>
                        <span style={{ fontSize:11, color:C.muted }}>{t.count.toLocaleString()}</span>
                      </div>
                      <div style={{ background:C.light, borderRadius:2, height:4 }}>
                        <div style={{ height:"100%", borderRadius:2, background:`hsl(${210+i*18},65%,50%)`, width:`${(t.count/metrics.typeData[0].count)*100}%` }}/>
                      </div>
                    </div>
                  </div>
                ))}
              </Section>
            </div>
          </div>

          {/* Row 2: Trends */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <Section title="Request Volume by Day" subtitle={period.label}>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={metrics.trend} margin={{ left:0, right:16, top:4, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.light}/>
                  <XAxis dataKey="date" tick={{ fill:C.muted, fontSize:10 }} tickFormatter={d=>d.slice(5)} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                  <YAxis tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} width={36}/>
                  <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, fontSize:12 }}/>
                  <Line type="monotone" dataKey="Total"  stroke={C.blue}  strokeWidth={2}   dot={false} name="Total"/>
                  <Line type="monotone" dataKey="Closed" stroke={C.green} strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Closed"/>
                  <Line type="monotone" dataKey="Open"   stroke={C.amber} strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Open"/>
                  <Legend wrapperStyle={{ fontSize:11, color:C.muted }}/>
                </LineChart>
              </ResponsiveContainer>
            </Section>
            <Section title="Request Volume by Week" subtitle={period.label}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={metrics.weekTrend} margin={{ left:0, right:16, top:4, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.light}/>
                  <XAxis dataKey="week" tick={{ fill:C.muted, fontSize:10 }} tickFormatter={d=>`W/${d.slice(5,7)}/${d.slice(2,4)}`} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} width={36}/>
                  <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, fontSize:12 }}/>
                  <Bar dataKey="Closed" stackId="a" fill={C.blue}  name="Closed"/>
                  <Bar dataKey="Open"   stackId="a" fill={C.amber} name="Open/Other" radius={[3,3,0,0]}/>
                  <Legend wrapperStyle={{ fontSize:11, color:C.muted }}/>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          </div>

          {/* Row 2b: DCT Project Breakdown */}
          <div style={{ marginBottom:16 }}>
            <Section title="DCT Ticket Volume · By Jira Project" subtitle={`${period.label} · DCT members only vs all assignees`}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                      {["Project","Label","All Tickets","All Closed","Close%","DCT Tickets","DCT Closed","DCT Close%","DCT%"].map(h=>(
                        <th key={h} style={{ padding:"10px 12px", textAlign:"left", color:C.slate,
                          fontSize:10, fontWeight:700, whiteSpace:"nowrap", letterSpacing:.5,
                          textTransform:"uppercase", background:C.bg }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.projectData.map((p,i) => {
                      const closePct  = p.total  ? Math.round(p.closed    / p.total  * 100) : 0;
                      const dctClose  = p.dct    ? Math.round(p.dctClosed / p.dct    * 100) : 0;
                      const dctShare  = p.total  ? Math.round(p.dct       / p.total  * 100) : 0;
                      const pc = closePct>=90?C.green:closePct>=70?C.amber:C.red;
                      const dc = dctClose>=90?C.green:dctClose>=70?C.amber:C.red;
                      return (
                        <tr key={p.key} style={{ borderBottom:`1px solid ${C.light}`, background:i%2===0?"#fff":C.bg }}>
                          <td style={{ padding:"9px 12px", fontFamily:"monospace", fontSize:11, color:C.slate }}>{p.key}</td>
                          <td style={{ padding:"9px 12px", fontWeight:700, color:C.text }}>{p.label}</td>
                          <td style={{ padding:"9px 12px", color:C.text }}>{p.total.toLocaleString()}</td>
                          <td style={{ padding:"9px 12px", color:C.blue }}>{p.closed.toLocaleString()}</td>
                          <td style={{ padding:"9px 12px", color:pc, fontWeight:600 }}>{closePct}%</td>
                          <td style={{ padding:"9px 12px", color:C.purple, fontWeight:700 }}>{p.dct.toLocaleString()}</td>
                          <td style={{ padding:"9px 12px", color:C.green, fontWeight:700 }}>{p.dctClosed.toLocaleString()}</td>
                          <td style={{ padding:"9px 12px", color:dc, fontWeight:600 }}>{dctClose}%</td>
                          <td style={{ padding:"9px 12px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ flex:1, background:C.light, borderRadius:3, height:5, minWidth:40 }}>
                                <div style={{ height:"100%", borderRadius:3, background:C.purple, width:`${dctShare}%` }}/>
                              </div>
                              <span style={{ color:C.purple, fontWeight:700, fontSize:11, minWidth:28 }}>{dctShare}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop:`2px solid ${C.border}`, background:C.bg, fontWeight:700 }}>
                      <td colSpan={2} style={{ padding:"9px 12px", color:C.text, fontSize:11 }}>TOTAL</td>
                      <td style={{ padding:"9px 12px", color:C.text }}>{tickets.length.toLocaleString()}</td>
                      <td style={{ padding:"9px 12px", color:C.blue }}>{metrics.closed.toLocaleString()}</td>
                      <td style={{ padding:"9px 12px", color:C.green }}>{metrics.closedPct}%</td>
                      <td style={{ padding:"9px 12px", color:C.purple }}>{metrics.totalDct.toLocaleString()}</td>
                      <td style={{ padding:"9px 12px", color:C.green }}>{metrics.dctClosed.toLocaleString()}</td>
                      <td style={{ padding:"9px 12px", color:C.green }}>{metrics.dctPct}%</td>
                      <td style={{ padding:"9px 12px", color:C.purple, fontWeight:700 }}>
                        {tickets.length ? Math.round(metrics.totalDct/tickets.length*100) : 0}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>
          </div>



          {/* Row 3: Site table */}
          <Section title="Site Performance Summary" subtitle={`${period.label} · MTTR: ${metrics.mttrSource}`}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                    {["#","Site","Location","Total","Closed","In Progress","On Hold","Close Rate","Avg MTTR"].map(h=>(
                      <th key={h} style={{ padding:"10px 12px", textAlign:"left", color:C.slate,
                        fontSize:10, fontWeight:700, whiteSpace:"nowrap", letterSpacing:.5,
                        textTransform:"uppercase", background:C.bg }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.siteData.map((s,i)=>{
                    const closed  = s["Closed"]||0;
                    const inProg  = (s["In Progress"]||0)+(s["Verification"]||0);
                    const onHold  = s["On Hold"]||0;
                    const pct     = s.total ? Math.round(closed/s.total*100) : 0;
                    const mttr    = metrics.mttrBySite[s.site];
                    const mc      = metrics.mttrColor(mttr);
                    const pc      = pct>=90?C.green:pct>=70?C.amber:C.red;
                    return (
                      <tr key={s.site} style={{ borderBottom:`1px solid ${C.light}`, background:i%2===0?"#fff":C.bg }}>
                        <td style={{ padding:"8px 12px", color:C.muted, fontSize:11 }}>{i+1}</td>
                        <td style={{ padding:"8px 12px", fontWeight:700, color:C.text, fontFamily:"monospace", fontSize:12 }}>{s.site}</td>
                        <td style={{ padding:"8px 12px", color:C.muted, fontSize:11 }}>{SITE_LABELS[s.site]||"—"}</td>
                        <td style={{ padding:"8px 12px", fontWeight:700, color:C.text }}>{s.total.toLocaleString()}</td>
                        <td style={{ padding:"8px 12px", color:C.blue }}>{closed.toLocaleString()}</td>
                        <td style={{ padding:"8px 12px", color:C.amber }}>{inProg.toLocaleString()}</td>
                        <td style={{ padding:"8px 12px", color:C.purple }}>{onHold.toLocaleString()}</td>
                        <td style={{ padding:"8px 12px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <div style={{ flex:1, background:C.light, borderRadius:3, height:5, minWidth:50 }}>
                              <div style={{ height:"100%", borderRadius:3, background:pc, width:`${pct}%` }}/>
                            </div>
                            <span style={{ color:pc, fontWeight:700, fontSize:12, minWidth:32 }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding:"8px 12px", color:mc, fontWeight:600 }}>{metrics.fmtMttr(mttr)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop:14, paddingTop:12, borderTop:`1px solid ${C.border}`, fontSize:10, color:C.muted, textAlign:"right" }}>
              {period.label} · {dateField==="created"?"Created":"Resolved"} Date · {tickets.length.toLocaleString()} tickets · Confidential — DC OPS · {today}
            </div>
          </Section>

          {/* Row 4: Verification Backlog + On Hold KPIs + Open Backlog Aging */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>

            {/* Verification backlog */}
            <Section title="Pending Verification" subtitle="DCT work done — awaiting sign-off">
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ textAlign:"center", padding:"20px 0" }}>
                  <div style={{ fontSize:64, fontWeight:800, color:C.orange, lineHeight:1 }}>
                    {metrics.verificationCount.toLocaleString()}
                  </div>
                  <div style={{ fontSize:13, color:C.muted, marginTop:8 }}>tickets in Verification</div>
                  <div style={{ fontSize:11, color:C.slate, marginTop:4 }}>
                    Work completed by DCT, pending closure
                  </div>
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <div style={{ flex:1, background:C.bg, borderRadius:8, padding:"12px 14px", textAlign:"center" }}>
                    <div style={{ fontSize:24, fontWeight:800, color:C.purple }}>{metrics.onHoldCount.toLocaleString()}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>On Hold</div>
                  </div>
                  <div style={{ flex:1, background:C.bg, borderRadius:8, padding:"12px 14px", textAlign:"center" }}>
                    <div style={{ fontSize:24, fontWeight:800, color:C.green }}>{metrics.dctClosed.toLocaleString()}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>DCT Closed</div>
                  </div>
                </div>
                <div style={{ fontSize:10, color:C.muted, background:C.bg, borderRadius:6, padding:"8px 10px" }}>
                  ⚠ Verification tickets represent completed work not yet reflected in close rate metrics.
                </div>
              </div>
            </Section>

            {/* Open backlog aging */}
            <Section title="Open Backlog Age" subtitle="Active tickets by age — excl. On Hold">
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:8 }}>
                {metrics.agingData.map(({label, count}) => {
                  const maxCount = Math.max(...metrics.agingData.map(d=>d.count), 1);
                  const pct = Math.round(count/maxCount*100);
                  const color = label==="<7d"?C.green:label==="7–30d"?C.blue:label==="30–90d"?C.amber:C.red;
                  return (
                    <div key={label}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                        <span style={{ fontSize:12, color:C.text, fontWeight:600 }}>{label}</span>
                        <span style={{ fontSize:12, color, fontWeight:700 }}>{count.toLocaleString()}</span>
                      </div>
                      <div style={{ background:C.light, borderRadius:4, height:8 }}>
                        <div style={{ height:"100%", borderRadius:4, background:color, width:`${pct}%`, transition:"width .4s" }}/>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop:8, fontSize:10, color:C.muted }}>
                  {metrics.agingData.find(d=>d.label===">90d")?.count > 0 &&
                    `⚠ ${metrics.agingData.find(d=>d.label===">90d").count} tickets older than 90 days`}
                </div>
              </div>
            </Section>

            {/* Asset type split */}
            <Section title="Asset Type · DCT Tickets" subtitle="Server vs Network linked tickets">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={metrics.assetPieData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                       dataKey="value" paddingAngle={2}>
                    {metrics.assetPieData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                  </Pie>
                  <Tooltip formatter={(v,n)=>[v.toLocaleString(),n]}
                    contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, fontSize:12 }}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {metrics.assetPieData.map(d=>(
                  <div key={d.name} style={{ display:"flex", justifyContent:"space-between", fontSize:12 }}>
                    <span style={{ color:d.color, fontWeight:600 }}>● {d.name}</span>
                    <span style={{ color:C.muted }}>
                      {d.value.toLocaleString()}
                      <span style={{ color:C.slate, marginLeft:6 }}>
                        ({metrics.dctTickets.length ? Math.round(d.value/metrics.dctTickets.length*100) : 0}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* Row 5: Maintenance Type + Avg Time per Status */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>

            {/* Maintenance Type breakdown */}
            <Section title="Maintenance Type · DCT Tickets" subtitle={`${period.label} · All statuses`}>
              {metrics.maintData.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px 0", color:C.muted, fontSize:13 }}>
                  No Maintenance Type data — field may not be set on these tickets
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, metrics.maintData.length * 36)}>
                  <BarChart data={metrics.maintData} layout="vertical" margin={{ left:0, right:60, top:4, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.light} horizontal={false}/>
                    <XAxis type="number" tick={{ fill:C.muted, fontSize:11 }} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="type" tick={{ fill:C.slate, fontSize:11 }} width={120} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, fontSize:12 }}
                      formatter={(v,n)=>[v.toLocaleString(), n]}/>
                    <Legend wrapperStyle={{ fontSize:11, color:C.muted, paddingTop:8 }}/>
                    <Bar dataKey="closed" stackId="a" fill={C.green}  name="Closed" radius={[0,0,0,0]}/>
                    <Bar dataKey="total"  stackId="b" fill={C.light}  name="Total"  radius={[0,3,3,0]}
                      label={{ position:"right", fill:C.slate, fontSize:11,
                        formatter:(v)=>v>0?v.toLocaleString():"" }}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>

            {/* Avg time per status */}
            <Section title="Avg Resolution Time · By Status Group" subtitle="Hours per ticket group — SLA or wall-clock">
              {metrics.statusTimeData.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px 0", color:C.muted, fontSize:13 }}>
                  No resolution time data available
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:14, marginTop:8 }}>
                  {metrics.statusTimeData.map(({status, avgHours}) => {
                    const mc = metrics.mttrColor(avgHours);
                    const maxH = Math.max(...metrics.statusTimeData.map(d=>d.avgHours), 1);
                    const pct = Math.round(avgHours/maxH*100);
                    const fmt = avgHours<1?`${Math.round(avgHours*60)}m`:avgHours<24?`${avgHours.toFixed(1)}h`:`${(avgHours/24).toFixed(1)}d`;
                    return (
                      <div key={status}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                          <span style={{ fontSize:12, color:C.text, fontWeight:600 }}>{status}</span>
                          <span style={{ fontSize:13, color:mc, fontWeight:800 }}>{fmt}</span>
                        </div>
                        <div style={{ background:C.light, borderRadius:4, height:8 }}>
                          <div style={{ height:"100%", borderRadius:4, background:mc, width:`${pct}%` }}/>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize:10, color:C.muted, marginTop:4, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                    Source: {metrics.mttrSource} · Grouped by final ticket status
                  </div>
                </div>
              )}
            </Section>
          </div>

        </div>
      )}
    </div>
  );
}
