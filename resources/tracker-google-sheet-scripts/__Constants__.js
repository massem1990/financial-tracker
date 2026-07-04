var sheetNames = 
  [
    'Shopping-Essential', 
    'Shopping-Non-Essential', 
    'Recurring', 
    'Personal-Mo', 
    'Personal-Alice', 
    'CreditCard-Mo', 
    'CreditCard-Alice', 
    'Revolut-Alice', 
    'Revolut-Alice-Ro',
    'Revolut-Mo', 
    'Investment Wallet'
  ];

/** Google Drive folder IDs for upload pipeline (unconverted uploads vs converted Sheets). */
var DriveFolders = {
  UNCONVERTED: '1538eVnVvU87h0FdBivlDCLEQdouDvq5j',
  CONVERTED: '1Gy2EFaIRLJ9pjzzTuYnEbEhwmjTEBOKU'
};

/**
 * 0-based column indices for a standard transaction data row (getValues()).
 * 1-based spreadsheet columns for setValue/getCell use TX_CELL_COL.
 */
var TX_IDX = {
  AMOUNT: 6,
  LONG_DESC: 7,
  SHORT_DESC: 8,
  CATEGORY: 9,
  YEAR_MONTH: 10,
  YEAR: 12
};

var TX_CELL_COL = {
  SHORT_DESC: 9,
  CATEGORY: 10,
  TRAVEL_NOTE: 14
};

// Categories
var indexCol_firstMonth = letterToIndex('F');

var mapAccountIdtoSheetName = {
  891216855 : "Shopping-Essential",
  124103286 : "Shopping-Non-Essential",
  885965906 : "Recurring",
  550908854 : "Personal-Mo",
  530168537 : "Personal-Alice",
  887606245 : "Investment Wallet"
};


/**
 * Keyword strings per category (readable). Merged into `inputCategoryKeywords`.
 * Use a string for match-only, or { keyword: 'X', shortDescription: 'Y' } to also set the
 * short-description column when X matches (same last-match-wins rules as categorization).
 */
var inputCategoryKeywordGroups = {
  // --------------- Income ---------------
  'Income': [
    'salary',
  ],

  'Other Income': [
    'DIVIDEND', // Investment
    'Original USD', // stocks from Booking
  ],

  // --------------- TEMP ---------------
  'Amazon (Temp)': [
    'amazon',
  ],

  'Bol (Temp)': [
    'bol.com',
  ],

  'Media Markt (Temp)': [
    'Media Markt',
  ],

  'PayPal (Temp)': [
    'PayPal',
  ],

  'Coolblue (Temp)': [
    'Coolblue',
  ],

  // ------------------------------------

  'Loterij': [
    'Loterij',
    'LOTERIJ',
  ],
  

  'Restaurants and cafes': [
    'Itoshii',
    'Schiphol',
    'Restaurant',
    'Dream Kebab',
    'thuisbezorg',
    'kaap West',
    'deliveroo',
    'meram',
    'starbucks',
    'booking.com the bank',
    'HMS Host Internation',
    'Shamna Cuisine',
    'BUENOS AIRES GRILL',
    'iZ IJspotje',
    'Shabu Shabu',
    'McDonald',
    'KFC ',
    'Falafel',
    'ALSHAM',
    'Coffee',
    'Beachclub',
    'Vermaat', // Usually catering from gas stations
    'Para Horeca', // Overzicht restaurant
    'Van Stapele', // Cookies
    'Vishande', // Fish cart
    'UBER  EATS',
    'Poffertjes',
    'Butcher',
    'Booking.com Campus',
    'Pizzeria',
    'Gall & Gall',
    'Het feest van Harry',
    { keyword: 'LIKKIE', shortDescription: 'Icecream' },
    'De Zeemeeuw', //
    'Hudson',
    'A Beautiful Mess',
    'de Duinen eten',
    'Zeespiegel',
    'Brasserie',
    'Ruizendaal',
    'Bij Oma Thuis',
    'Het Goudhaantje', //chicken cart
    'VV Noordwijk', //cafe at kids's gym
    'Sham',
    'bestratingen', // Stroopwafels
    'Vivaldi', // Icecreams
    'SFN Lisse Horeca',
    'Strandpaviljoen',
    'Van Eeden', // Bakery
    'ijscuypje',
    'pizza',
    'burger',
    'La Rosario Lisse', // steak house
  ],

  'Outings': [
    'Attractiepark',
    'Museum',
    'Tikibad',
    'TicketCounter',
    'Stg. Koninklijke', // Zoo Roterdam
    'Blijdorp', // Zoo Roterdam
    'KidsZoo',
    'Dierenhoe',
    'SPORTFONDSEN', // Swimming pool
    'KinderSpeelCafA',
    'DC Dance',
    'Avonturenboerderij',
    'Ridammerhoeve', // Goat farm
    'De Speelakker', // speeltown Noordwijk
    'KURIOS',
    'Playhood',
    'Duinrell',
    'Bubbeljungle',
    'Kinepolis CineMeerse',
    'Johan Cruijff ArenA',
    'julianator',
    'Peppa Pig',
    'Wasbeek', //swimming pool
  ],

  'Food & Household Supplies': [ // was supermarket
    'albert heijn',
    'AH to',
    'Supermarkt',
    'kaddour',
    'Slagerij',
    'karadeniz',
    'getir',
    'flink',
    'Bakkerij',
    'Bakery',
    'Bakker',
    'Jumbo',
    'Lidl',
    'Aladdin\'s Notenhoek',
    'Le Fournil',
    'Makro',
    'Fruittuin',
    'Night Shop',
    'FYTO Amsterdam', // Romanian shop
    'Bessaha', // Slagerij
    'SaidiaMediterrania',
    'Versmarkt',
    'GROENTEN',
    'Quooker', // Quooker refill
    'IJSSALON', // Ice cream
    'NR:64092767', // Farm eggs, cheese, etc
    'Warmerdam', // Cheese shop
    'Dirk',
    '*ABC',
    'BERG BLOEMEN', // Fresh Vegetables
    'Groentebroer',
    'Detailconsult',
    'BIEDRONKI', // polish sm
    'Lisse Blokhuis', // bakker in lisse
    'Plein', // detergents
  ],

  'Medical': [
    'chiropra',
    'Vitamin',
    'Holland & Barrett',
    'Holland Barrett',
    'Holland&Barrett',
    'Pharmacie',
    'ITE Boerema', // Echo Amsterdam
    'Infomedics',
    'Apotheek',
    'OPTIEK',
    'DeOnlineDrogist.nl',
  ],

  'Self care products': [
    
    'douglas',
    'etos',
    'DECAAR',
    'TheHutGroup',
    'Ici Paris',
    'Paula\'s Choice',
    'Paula.s Choice',
    'Purmerul',
  ],

  'Self care appointments': [
    
    'Five City Spa',
    'TREATWELL',
    'Studio 7 Days',
    'Knippen',
    'Style by Wendy',
    'Arokaya',
    'Schoonheidssal',
  ],

  'House - Small Fixes & Renovations': [
    'praxis',
    'Bouwmarkt',
    'gamma',
    'Karwei', // Hardware store
    'Hornbach',
  ],

  'House items': [
    'ikea',
    'Kruidvat',
    'Blokker',
    'Hema',
    'Action',
    'temu',
    'GreenEgg',
    'Karcher',
    'Primera',
    'Intratuin',
  ],

  'Parking': [
    'parking',
    'ACADEMISCH ZIEKENH', //parking lumc
    'parkbee',
    'schiphol parking',
    'Schiphol P1',
    'Parkeren',
    'Q-Park',
    'Q Park',
    'P Mercatorplein',
    'P5 Villa Arena',
    'SMSPARKING',
    'P-Rokin',
    'Parkeer',
    'Gasthuis',
    'P+R',
  ],

  'Fuel': [
    
    'shell',
    'esso',
    'TotalEnergies',
    'Total Noordwijkerhout',
    'BP LINGEHORST',
    'Selecta Ruwiel', //shell
    'Aral Tankstelle',
    'TINQ',
  ],

  'Car Maintenance': [
    'Van Mossel Citroen',
  ],

  'Train Subscription': [
    'NS GROEP',
    'NS Internationaal',
  ],

  'Commute': [
    'OV-chipkaart',
    'ovpay',
    'Trans Link',
  ],


  'Gifts': [
    'The Brownie Box',
  ],

  'Familly': [
    
    'Omschrijving: Gift',
    'Transferwise: Familly',
    'Laic Robert Constantin',
    'DRAGOS LAIC',
  ],

  'Clothing': [
    'Takko',
    'Columbia',
    'Zalando',
    'TJX NEDERLAND', // TK Max
    'TK Maxx', // TK Max
    'Noppies',
    'PRIMARK',
    'S. Oliver',
    'Hunkemoller',
    'ASOS',
    'Peek & Cloppenburg',
    'Nelson',
    'H&M',
    'C&A',
    'ECCO',
    'Zara',
    'Levi',
    'H & M',
    'hm.com',
    'Crocs',
    'SCHOENEN',
    'Lucardi',
  ],

  'Travel': [
    // Derived keywords (flights / accommodation / expenses / transport) come from mapTravelCategories.
    // Keep only the extra travel indicators below.

    // Generic indication of a Travel
    'TORREMOLINOS',
    'LONDON',
    'MALAGA',

    // Some known expenses abroad
    'Kaufland',
    'Profi',
    'PEPCO',
  ],

  'Transfers': [
    
    'ICS 68400420011', // Credit card payback
    'uw creditcard ICS-klantnummer', // Credit card payback
    'International Card Services B.V.', // Credit card
    'betreffende uw creditcard', // Credit card
    'Top-Up', // Adding Money to revolut
    'To AA Laic', // Returning Money from revolut
    'Exchanged to ',
  ],

  'Medical Insurance': [
    
    'CZ Groep',
  ],

  'Insurance': [
    'vensverzekering', // Add different types here
    'Pakketpolisnr',
    'Allianz Direct ', // Car
    'UNIGARANT',
    'Nh1816',
    'InShared',
    'Fietsverzekering',
  ],

  'Taxes': [
    
    'BELASTINGDIENST',
  ],

  'Non-Monthly-Taxes': [
    'Gouwe-Rijnland',
    'Gemeente Noordwijk',
    'KINDERBIJSLAG', // The quarterly taxes, check best category
    'Waterschap Amstel',
  ],

  'House Renovations': [
    
    'Studio Interio',
    'HMU & Olsthoorn Bouw',
    'Meeuwenoord', // Trash collection
  ],

  'Kids: Supplies': [
    'Gezondheidswinkel', // Milk
    'Tiny Todd',
    'Newpharma',
  ],

  'Kids: Clothing': [
    'Babypark',
    'prenatal',
    'Baby-Dump',
    'GEOX',
    'iELM',
    'Jabadoo',

  ],

  'Kids: Toys': [
    'INTERTOYS',
    'Kiwikids',
    'Suzanne',
    'Feestshop',
    'Top1Toys',
    'Toys',
  ],

  'Kids: Daycare': [ //Kindergarten
    'Boomgaard',
    'TOESLAGEN',
    'kinderopvang',
  ],

  'Sports': [
    
    'Naam: USC ',
    'FITNESS JAAR',
    'Classpass',
    'Anytime Fitness',
    'Peutersport',
    'Judoschool',
  ],


  'Apartment - Internet': [
    // ------------ UTILITIES ------------
    '9113742266', // KPN
    '9695463', // Ziggo
  ],

  'House - Internet': [
    '18767893', // Ziggo
    'KPN', // Not worth splitting apartment from house
  ],

  'Apartment - Mortgage': [
    'ST11107004617970001',
  ],

  'House - Mortgage': [
    'ST11107005599370001',
  ],

  'Apartment - Electricity & Gas': [
    '3013956641', //Vattenfall: Apartment
  ],

  'House - Electricity': [
    '3015507560', //Vattenfall: House
  ],

  'Apartment - Water': [
    'Waternet',
  ],

  'House - Water': [
    'DUNEA DUIN',
  ],

  'Apartment - Building Maintenance': [
    // ------------ Maintainances ------------
    'VvE Waterfort',
  ],

  'Apartment - Maintenance': [
    'Bonarius',
  ],

  'House - Maintenance': [
    'DVC Beregening',
    'P.J.M. Jansen', // Glass cleaner
    'Duurz. Opgew.',
  ],

  'Garden Maintenance': [
    // 'Don Hoveniers',
    // 'Bosrand',
  ],

  
  'Bike Maintenance': [
    
    'Van Dam',
  ],

  
  'Phone': [
    
    'VODAFONE',
  ],

  'Online Subscriptions': [
    { keyword: 'Spotify', shortDescription: 'Spotify' },
    { keyword: 'HP Inc Instant Ink', shortDescription: 'Printer Ink' },
    { keyword: 'Netflix', shortDescription: 'Netflix' },
    { keyword: 'Disney', shortDescription: 'Disney' },
    { keyword: 'Youtube Plus', shortDescription: 'Youtube plus' },
    { keyword: 'ICloud+', shortDescription: 'ICloud+' },
    { keyword: 'Google Subscriptions', shortDescription: 'Google Subscriptions' },
    { keyword: 'Energy app', shortDescription: 'Energy app' },
    { keyword: 'VIDEOLAND', shortDescription: 'Video Land' },
  ],

  'Charity': [
    'UNICEF',
  ],



  'Cash Withdrawal': [
    
    'Geldmaat',
  ],

  'Paper work': [
    // --------- Fees/Taxes/Investment/Etc
    'CJIB', // Car fines usually
  ],

  'Bank Fees': [
    'ABNAMRO BELEGGEN', // Investment Fees
    'ABN AMRO Bank N.V',
    'ACCOUNT BALANCED', // Bank rebalancing fees, could be positive
  ],

  'Stock Investment': [
    'DEPOSIT INV.', // Investment
    'PURCHASE', // Investment
  ],

};

var mapTransferAccounts = {
  'NL04ABNA0102235287'         : 'Income',
  'NL25ABNA0885965906'         : 'Monthly Bills',
  'NL05ABNA0887606245'         : 'Investment Wallet',
  
  'NL38ABNA0550908854'         : 'Personal-Mo', 
  'NL31ABNA0530168537'         : 'Personal-Alice',
  'NL24ABNA0124103286'         : 'Shopping - Wants',
  'NL87ABNA0891216855'         : 'Shopping - Needs',
  'NL51ABNA0104025255'         : 'Common Savings',
  'NL79ABNA0109972694'         : 'Yearly Bills',
  'NL91ABNA0886155517'         : 'Travel',
  'NL46ABNA0109968050'         : 'Emergency Fund',
  'DE91120700700123825441'           : 'Trade Republic',
  'NL19TRBK0337509511'               : 'Trade Republic',
  'NL08REVO6270469900'               : 'Mo - Revolut',
  'NL58CITI2032329913'               : 'Alice - Revolut',
  'NL49ABNA0109968093'         : 'Familly',
  'NL18ABNA0530168286'               : 'Personal-Alice-Savings', // Personal-Alice-Savings - not actively used anymore
  'NL63ABNA0120379821'               : 'Garden', // Garden
  
  // 'Top-Up'                           : 'Transfers', // Adding Money to revolut
  // 'To AA Laic'                       : 'Transfers', // Returning Money from revolut


};

// TODO: when there is revolut and top car refund, which takes precendance

// ONLY USE UPPER CASE
var mapTravelCategoryGroups = {
  //Accommodation
  'Accommodation': [
    'HOTEL AT BOOKING.COM',
  ],

  //Flight
  'Flight': [
    'KLM',
    'TRANSAVIA',
    'TAROM',
    'BLUE AIR',
    'LUFTHAN',
    'VUELING',
    'WIZZAIR',
    'RYANAIR',
    'EASYJET',
  ],

  //Car/Taxi/Transport
  'Car/Taxi/Transport': [
    // Avoid matching inside words like "NETFLIX" (contains "TFL" as substring)
    'TFL TRAVEL CHARGE',
  ],

  //Expenses
  'Expenses': [
    'AIRALO',
    'GETYOURGUIDE',
    'WECHAT',
    'ALIPAY',
    'TORREMOLINOS',
    'LONDON',
    'MALAGA',
    'KAUFLAND',
    'PROFI',
    'PEPCO',
  ],
};

/**
 * When a keyword match resolves to PayPal (Temp) or Amazon (Temp) and the amount cell
 * string matches an inner key (same as `row[TX_IDX.AMOUNT].toString()`), the final
 * category is `CATEGORY_TEMP_AMOUNT_OVERRIDE` and the inner value is the short description.
 */
var CATEGORY_TEMP_AMOUNT_OVERRIDE = 'Online Subscriptions';

var inputCategoryAmountOverrides = Object.create(null);
inputCategoryAmountOverrides['PayPal (Temp)'] = {
  '-4.49': 'Printer Ink',
  '-4.99': 'Printer Ink',
  '-5.99': 'Printer Ink',
  '-9.99': 'Alice -ICloud+',
  '-13.99': 'Google Subscriptions', // used to be -9.99
  '-15.99': 'Disney', // used to be 10.99
  '-7.99': 'Bluey Game',
  '-0.99': 'Energy app',
  '-22.99': 'ChatGPT' //chatgpt ?
};
inputCategoryAmountOverrides['Amazon (Temp)'] = {
  '-4.99': 'Amazon prime',
  '-5.99': 'Amazon prime'
};

function buildTravelCategoryMap(groups) {
  var out = {};
  for (var category in groups) {
    if (!Object.prototype.hasOwnProperty.call(groups, category)) continue;
    var keys = groups[category];
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = category;
    }
  }
  return out;
}

// keyword -> subtype (used by categorization to fill Travel note)
var mapTravelCategories = buildTravelCategoryMap(mapTravelCategoryGroups);

// Derive transfer match keywords from the canonical mapTransferAccounts (single source of truth).
// These keywords still categorize as 'Transfers' and also map to a short-description account name.
if (inputCategoryKeywordGroups['Transfers'] && Array.isArray(inputCategoryKeywordGroups['Transfers'])) {
  Object.keys(mapTransferAccounts).forEach(function (k) {
    inputCategoryKeywordGroups['Transfers'].push(k);
  });
}

// Derive Travel match keywords from the canonical mapTravelCategories (single source of truth).
if (inputCategoryKeywordGroups['Travel'] && Array.isArray(inputCategoryKeywordGroups['Travel'])) {
  Object.keys(mapTravelCategories).forEach(function (k) {
    inputCategoryKeywordGroups['Travel'].push(k);
  });
}

var _categoryKeywordData = buildCategoryKeywordData(inputCategoryKeywordGroups);
var inputCategoryKeywords = _categoryKeywordData.categories;
var inputCategoryKeywordsLower = buildLowercaseKeywordLookup(inputCategoryKeywords);
var inputKeywordShortDescriptionsLower = buildLowercaseKeywordLookup(_categoryKeywordData.shortByKeyword);


