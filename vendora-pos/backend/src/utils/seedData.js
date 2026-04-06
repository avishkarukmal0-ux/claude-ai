'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config');
const logger = require('./logger');

const Store = require('../models/Store');
const Staff = require('../models/Staff');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Promotion = require('../models/Promotion');
const GiftCard = require('../models/GiftCard');
const CashDrawer = require('../models/CashDrawer');
const Sale = require('../models/Sale');
const StockMovement = require('../models/StockMovement');
const { generateCustomerCode } = require('./helpers');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 10;

async function seed() {
  await mongoose.connect(config.mongodb.uri);
  logger.info('Connected to MongoDB');

  // Drop DB
  await mongoose.connection.dropDatabase();
  logger.info('Database dropped');

  // ── STORE ──────────────────────────────────────────────────────────────────
  const store = await Store.create({
    name: "Raj's Off-Licence",
    address: { line1: '142 High Street', city: 'Romford', postcode: 'RM1 1HG', country: 'GB' },
    phone: '01708 123456',
    email: 'raj@rajsofflicence.co.uk',
    vatNumber: 'GB123456789',
    companyNumber: '12345678',
    settings: {
      targetFloat: 150,
      alertThreshold: 300,
      challenge25Enabled: true,
      loyaltyEnabled: true,
      loyaltyPointsPerPound: 1,
      loyaltyPointValue: 0.01,
      receiptHeader: "Raj's Off-Licence\n142 High Street, Romford RM1 1HG\nTel: 01708 123456\nVAT: GB123456789",
      receiptFooter: 'Thank you for shopping with us! Age 18+ Challenge 25 in operation.',
    },
  });
  logger.info(`Store created: ${store.name} (${store._id})`);

  // ── STAFF ─────────────────────────────────────────────────────────────────
  const staffData = [
    { employeeId: 'EMP001', displayName: 'Raj Patel',  email: 'raj@rajsofflicence.co.uk', pin: '1111', password: 'owner123',   role: 'owner',      permissions: { canVoid: true, canRefund: true, canDiscount: true, canViewReports: true, canManageProducts: true, canManageStaff: true, maxDiscountPercent: 100, maxRefundAmount: 9999 } },
    { employeeId: 'EMP002', displayName: 'Sarah Jones', email: 'sarah@rajsofflicence.co.uk', pin: '2222', password: 'manager123', role: 'manager',    permissions: { canVoid: true, canRefund: true, canDiscount: true, canViewReports: true, canManageProducts: true, canManageStaff: true, maxDiscountPercent: 50, maxRefundAmount: 500 } },
    { employeeId: 'EMP003', displayName: 'Tom Brown',  pin: '3333', role: 'supervisor', permissions: { canVoid: true, canRefund: true, canDiscount: true, canViewReports: true, maxDiscountPercent: 20, maxRefundAmount: 100 } },
    { employeeId: 'EMP004', displayName: 'Lisa Ahmed', pin: '4444', role: 'cashier',    permissions: { canVoid: false, canRefund: false, canDiscount: false, canOpenDrawer: true, maxDiscountPercent: 0, maxRefundAmount: 0 } },
  ];

  const staffMembers = [];
  for (const s of staffData) {
    const { pin, password, ...rest } = s;
    const hashedPin = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    const hashedPassword = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : undefined;
    const staff = await Staff.create({ store: store._id, pin: hashedPin, password: hashedPassword, ...rest });
    staffMembers.push(staff);
    logger.info(`Staff created: ${staff.displayName} (${staff.role}) PIN:${pin}`);
  }

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  const productsRaw = [
    // Beer
    { barcode: '5010116030046', name: 'Carling Lager 440ml Can',     category: 'Beer',         pricing: { costPrice: 0.65, retailPrice: 1.20, vatRate: 'standard' }, stock: { quantity: 144, lowStockThreshold: 24 }, attributes: { ageRestricted: true, minimumAge: 18, requiresChallenge25: false }, brand: 'Carling' },
    { barcode: '5000267013008', name: 'Stella Artois 568ml Can',     category: 'Beer',         pricing: { costPrice: 0.85, retailPrice: 1.65, vatRate: 'standard' }, stock: { quantity: 96, lowStockThreshold: 24 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Stella Artois' },
    { barcode: '5010116030145', name: 'Carling 4-Pack 440ml',        category: 'Beer',         pricing: { costPrice: 2.40, retailPrice: 4.50, vatRate: 'standard' }, stock: { quantity: 48, lowStockThreshold: 12 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Carling' },
    { barcode: '5000267024004', name: 'Heineken 330ml Bottle',       category: 'Beer',         pricing: { costPrice: 0.80, retailPrice: 1.50, vatRate: 'standard' }, stock: { quantity: 72, lowStockThreshold: 12 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Heineken' },
    { barcode: '5010000329490', name: 'Budweiser 330ml Bottle',      category: 'Beer',         pricing: { costPrice: 0.78, retailPrice: 1.45, vatRate: 'standard' }, stock: { quantity: 72, lowStockThreshold: 12 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Budweiser' },
    { barcode: '5010316040024', name: 'Fosters 440ml Can',           category: 'Beer',         pricing: { costPrice: 0.58, retailPrice: 1.10, vatRate: 'standard' }, stock: { quantity: 120, lowStockThreshold: 24 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Fosters' },
    { barcode: '5010267002085', name: 'Peroni 330ml Bottle',         category: 'Beer',         pricing: { costPrice: 1.05, retailPrice: 1.80, vatRate: 'standard' }, stock: { quantity: 60, lowStockThreshold: 12 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Peroni' },
    { barcode: '5000267034003', name: 'Corona Extra 330ml',          category: 'Beer',         pricing: { costPrice: 0.99, retailPrice: 1.75, vatRate: 'standard' }, stock: { quantity: 60, lowStockThreshold: 12 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Corona' },
    // Spirits
    { barcode: '5010494001028', name: "Gordon's Gin 70cl",           category: 'Spirits',      pricing: { costPrice: 8.50, retailPrice: 16.00, vatRate: 'standard' }, stock: { quantity: 24, lowStockThreshold: 6 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: "Gordon's" },
    { barcode: '5000299605516', name: 'Smirnoff Vodka 70cl',         category: 'Spirits',      pricing: { costPrice: 9.00, retailPrice: 18.00, vatRate: 'standard' }, stock: { quantity: 24, lowStockThreshold: 6 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Smirnoff' },
    { barcode: '5010056001055', name: "Jack Daniel's 70cl",          category: 'Spirits',      pricing: { costPrice: 15.00, retailPrice: 28.00, vatRate: 'standard' }, stock: { quantity: 12, lowStockThreshold: 3 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: "Jack Daniel's" },
    { barcode: '5010103501022', name: 'Famous Grouse 70cl',          category: 'Spirits',      pricing: { costPrice: 12.00, retailPrice: 22.00, vatRate: 'standard' }, stock: { quantity: 12, lowStockThreshold: 3 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Famous Grouse' },
    { barcode: '5010496000032', name: 'Bacardi White Rum 70cl',      category: 'Spirits',      pricing: { costPrice: 9.50, retailPrice: 17.00, vatRate: 'standard' }, stock: { quantity: 12, lowStockThreshold: 3 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Bacardi' },
    // Wine
    { barcode: '3036760001001', name: "Hardy's Shiraz 75cl",         category: 'Wine',         pricing: { costPrice: 3.50, retailPrice: 6.99, vatRate: 'standard' }, stock: { quantity: 24, lowStockThreshold: 6 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: "Hardy's" },
    { barcode: '3036760003005', name: "Jacob's Creek Chardonnay 75cl", category: 'Wine',       pricing: { costPrice: 4.00, retailPrice: 7.50, vatRate: 'standard' }, stock: { quantity: 24, lowStockThreshold: 6 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: "Jacob's Creek" },
    { barcode: '3086126100012', name: 'Blossom Hill White 75cl',     category: 'Wine',         pricing: { costPrice: 3.20, retailPrice: 6.50, vatRate: 'standard' }, stock: { quantity: 24, lowStockThreshold: 6 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Blossom Hill' },
    // Soft Drinks
    { barcode: '5449000000996', name: 'Coca-Cola 330ml Can',         category: 'Soft Drinks',  pricing: { costPrice: 0.28, retailPrice: 0.85, vatRate: 'zero' }, stock: { quantity: 240, lowStockThreshold: 48 }, brand: 'Coca-Cola' },
    { barcode: '5449000054227', name: 'Coca-Cola 1.75L Bottle',      category: 'Soft Drinks',  pricing: { costPrice: 0.95, retailPrice: 2.25, vatRate: 'zero' }, stock: { quantity: 60, lowStockThreshold: 12 }, brand: 'Coca-Cola' },
    { barcode: '5449000133328', name: 'Sprite 330ml Can',            category: 'Soft Drinks',  pricing: { costPrice: 0.25, retailPrice: 0.80, vatRate: 'zero' }, stock: { quantity: 144, lowStockThreshold: 24 }, brand: 'Sprite' },
    { barcode: '5000112638219', name: 'Lucozade Energy 500ml',       category: 'Soft Drinks',  pricing: { costPrice: 0.55, retailPrice: 1.49, vatRate: 'standard' }, stock: { quantity: 72, lowStockThreshold: 24 }, brand: 'Lucozade' },
    { barcode: '5010251012405', name: 'Red Bull 250ml',              category: 'Soft Drinks',  pricing: { costPrice: 0.65, retailPrice: 1.69, vatRate: 'standard' }, stock: { quantity: 96, lowStockThreshold: 24 }, brand: 'Red Bull' },
    { barcode: '5000128035965', name: 'Monster Energy 500ml',        category: 'Soft Drinks',  pricing: { costPrice: 0.75, retailPrice: 1.79, vatRate: 'standard' }, stock: { quantity: 72, lowStockThreshold: 24 }, brand: 'Monster' },
    { barcode: '5449000103260', name: 'Fanta Orange 330ml Can',      category: 'Soft Drinks',  pricing: { costPrice: 0.25, retailPrice: 0.80, vatRate: 'zero' }, stock: { quantity: 120, lowStockThreshold: 24 }, brand: 'Fanta' },
    { barcode: '5000116029100', name: 'Ribena Blackcurrant 500ml',   category: 'Soft Drinks',  pricing: { costPrice: 0.48, retailPrice: 1.20, vatRate: 'zero' }, stock: { quantity: 60, lowStockThreshold: 12 }, brand: 'Ribena' },
    // Confectionery
    { barcode: '7622210100054', name: 'Cadbury Dairy Milk 200g',     category: 'Confectionery', pricing: { costPrice: 0.90, retailPrice: 1.75, vatRate: 'zero' }, stock: { quantity: 60, lowStockThreshold: 12 }, brand: 'Cadbury' },
    { barcode: '5000159461122', name: 'KitKat 4-Finger',             category: 'Confectionery', pricing: { costPrice: 0.28, retailPrice: 0.65, vatRate: 'zero' }, stock: { quantity: 120, lowStockThreshold: 24 }, brand: 'Nestle' },
    { barcode: '7622210100085', name: 'Cadbury Roses Box 187g',      category: 'Confectionery', pricing: { costPrice: 1.80, retailPrice: 3.50, vatRate: 'zero' }, stock: { quantity: 30, lowStockThreshold: 6 }, brand: 'Cadbury' },
    { barcode: '5000116000316', name: 'Haribo Starmix 175g',         category: 'Confectionery', pricing: { costPrice: 0.42, retailPrice: 1.00, vatRate: 'zero' }, stock: { quantity: 72, lowStockThreshold: 12 }, brand: 'Haribo' },
    { barcode: '7622210448071', name: 'Oreo Original 154g',          category: 'Confectionery', pricing: { costPrice: 0.70, retailPrice: 1.20, vatRate: 'standard' }, stock: { quantity: 48, lowStockThreshold: 12 }, brand: 'Oreo' },
    { barcode: '5000295105409', name: 'Walkers Shortbread 150g',     category: 'Confectionery', pricing: { costPrice: 0.75, retailPrice: 1.50, vatRate: 'zero' }, stock: { quantity: 36, lowStockThreshold: 6 }, brand: 'Walkers' },
    { barcode: '5000208157833', name: 'Maltesers 103g',              category: 'Confectionery', pricing: { costPrice: 0.65, retailPrice: 1.35, vatRate: 'zero' }, stock: { quantity: 48, lowStockThreshold: 12 }, brand: 'Mars' },
    // Tobacco
    { barcode: '3014260002152', name: 'Lambert & Butler 20s',        category: 'Tobacco',       pricing: { costPrice: 9.50, retailPrice: 12.50, vatRate: 'standard' }, stock: { quantity: 100, lowStockThreshold: 20 }, attributes: { ageRestricted: true, minimumAge: 18, requiresChallenge25: true }, brand: 'L&B' },
    { barcode: '3614224701003', name: 'Marlboro Red 20s',            category: 'Tobacco',       pricing: { costPrice: 10.20, retailPrice: 13.50, vatRate: 'standard' }, stock: { quantity: 100, lowStockThreshold: 20 }, attributes: { ageRestricted: true, minimumAge: 18, requiresChallenge25: true }, brand: 'Marlboro' },
    { barcode: '4002111100014', name: 'Rizla Green King Size',       category: 'Tobacco',       pricing: { costPrice: 0.45, retailPrice: 1.20, vatRate: 'standard' }, stock: { quantity: 200, lowStockThreshold: 40 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'Rizla' },
    { barcode: '5000194066013', name: 'Golden Virginia 30g',         category: 'Tobacco',       pricing: { costPrice: 11.00, retailPrice: 14.50, vatRate: 'standard' }, stock: { quantity: 60, lowStockThreshold: 10 }, attributes: { ageRestricted: true, minimumAge: 18, requiresChallenge25: true }, brand: 'Golden Virginia' },
    // Snacks
    { barcode: '5000328530012', name: 'Walkers Ready Salted 32.5g',  category: 'Snacks',        pricing: { costPrice: 0.20, retailPrice: 0.60, vatRate: 'standard' }, stock: { quantity: 100, lowStockThreshold: 20 }, brand: 'Walkers' },
    { barcode: '5000328530098', name: 'Walkers Cheese & Onion 32.5g', category: 'Snacks',       pricing: { costPrice: 0.20, retailPrice: 0.60, vatRate: 'standard' }, stock: { quantity: 100, lowStockThreshold: 20 }, brand: 'Walkers' },
    { barcode: '5000232115011', name: 'Pringles Original 165g',      category: 'Snacks',        pricing: { costPrice: 1.10, retailPrice: 2.50, vatRate: 'standard' }, stock: { quantity: 48, lowStockThreshold: 12 }, brand: 'Pringles' },
    { barcode: '5060004383819', name: "McCoy's Flame Grilled Steak", category: 'Snacks',        pricing: { costPrice: 0.22, retailPrice: 0.65, vatRate: 'standard' }, stock: { quantity: 80, lowStockThreshold: 16 }, brand: "McCoy's" },
    { barcode: '5060023015063', name: 'Doritos Tangy Cheese',        category: 'Snacks',        pricing: { costPrice: 0.22, retailPrice: 0.65, vatRate: 'standard' }, stock: { quantity: 80, lowStockThreshold: 16 }, brand: 'Doritos' },
    { barcode: '5000159069106', name: 'Skips Prawn Cocktail',        category: 'Snacks',        pricing: { costPrice: 0.18, retailPrice: 0.55, vatRate: 'standard' }, stock: { quantity: 60, lowStockThreshold: 12 }, brand: 'Skips' },
    // Household
    { barcode: '8714100110462', name: 'Sensodyne Toothpaste 75ml',   category: 'Household',     pricing: { costPrice: 1.80, retailPrice: 3.50, vatRate: 'zero' }, stock: { quantity: 30, lowStockThreshold: 6 }, brand: 'Sensodyne' },
    { barcode: '8001090416117', name: 'Pampers Newborn 24 Pack',     category: 'Household',     pricing: { costPrice: 3.50, retailPrice: 6.99, vatRate: 'zero' }, stock: { quantity: 20, lowStockThreshold: 4 }, brand: 'Pampers' },
    { barcode: '3228857000906', name: 'Colgate Max White 75ml',      category: 'Household',     pricing: { costPrice: 1.40, retailPrice: 2.99, vatRate: 'zero' }, stock: { quantity: 24, lowStockThreshold: 6 }, brand: 'Colgate' },
    { barcode: '9300601111558', name: 'Lynx Africa Body Spray 150ml', category: 'Household',    pricing: { costPrice: 1.20, retailPrice: 2.50, vatRate: 'standard' }, stock: { quantity: 24, lowStockThreshold: 6 }, brand: 'Lynx' },
    // Top-Up
    { barcode: '0000TOPUP5000',  name: 'Mobile Top-Up £5',  category: 'Top-Up', pricing: { costPrice: 5.00, retailPrice: 5.00, vatRate: 'zero' }, stock: { quantity: 999 } },
    { barcode: '0000TOPUP1000',  name: 'Mobile Top-Up £10', category: 'Top-Up', pricing: { costPrice: 10.00, retailPrice: 10.00, vatRate: 'zero' }, stock: { quantity: 999 } },
    { barcode: '0000TOPUP2000',  name: 'Mobile Top-Up £20', category: 'Top-Up', pricing: { costPrice: 20.00, retailPrice: 20.00, vatRate: 'zero' }, stock: { quantity: 999 } },
    // Misc
    { barcode: '0000NEWSPAPER1', name: 'Daily Mirror', category: 'Newspapers', pricing: { costPrice: 0.45, retailPrice: 0.90, vatRate: 'zero' }, stock: { quantity: 50, lowStockThreshold: 5 } },
    { barcode: '0000NEWSPAPER2', name: 'The Sun',      category: 'Newspapers', pricing: { costPrice: 0.40, retailPrice: 0.80, vatRate: 'zero' }, stock: { quantity: 50, lowStockThreshold: 5 } },
    // Lottery
    { barcode: 'LOTT-LD-200', name: 'National Lottery Lucky Dip £2',    category: 'Lottery', pricing: { costPrice: 2.00,  retailPrice: 2.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: true, minimumAge: 18, requiresChallenge25: false }, brand: 'National Lottery' },
    { barcode: 'LOTT-LD-500', name: 'National Lottery Lucky Dip £5',    category: 'Lottery', pricing: { costPrice: 5.00,  retailPrice: 5.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'National Lottery' },
    { barcode: 'LOTT-EM-250', name: 'EuroMillions Lucky Dip £2.50',     category: 'Lottery', pricing: { costPrice: 2.50,  retailPrice: 2.50,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'EuroMillions' },
    { barcode: 'LOTT-TB-100', name: 'Thunderball Lucky Dip £1',         category: 'Lottery', pricing: { costPrice: 1.00,  retailPrice: 1.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'National Lottery' },
    { barcode: 'LOTT-SL-150', name: 'Set For Life £1.50',               category: 'Lottery', pricing: { costPrice: 1.50,  retailPrice: 1.50,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'National Lottery' },
    { barcode: 'LOTT-IW-100', name: 'Instant Win Scratchcard £1',       category: 'Lottery', pricing: { costPrice: 1.00,  retailPrice: 1.00,  vatRate: 'zero' }, stock: { quantity: 200, lowStockThreshold: 20 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'National Lottery' },
    { barcode: 'LOTT-IW-200', name: 'Instant Win Scratchcard £2',       category: 'Lottery', pricing: { costPrice: 2.00,  retailPrice: 2.00,  vatRate: 'zero' }, stock: { quantity: 200, lowStockThreshold: 20 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'National Lottery' },
    { barcode: 'LOTT-IW-500', name: 'Instant Win Scratchcard £5',       category: 'Lottery', pricing: { costPrice: 5.00,  retailPrice: 5.00,  vatRate: 'zero' }, stock: { quantity: 100, lowStockThreshold: 10 }, attributes: { ageRestricted: true, minimumAge: 18 }, brand: 'National Lottery' },
    // Mobile Top-Up
    { barcode: 'TOPUP-EE-5',   name: 'EE Top-Up £5',            category: 'Mobile Top-Up', pricing: { costPrice: 5.00,   retailPrice: 5.00,   vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'EE' },
    { barcode: 'TOPUP-EE-10',  name: 'EE Top-Up £10',           category: 'Mobile Top-Up', pricing: { costPrice: 10.00,  retailPrice: 10.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'EE' },
    { barcode: 'TOPUP-EE-20',  name: 'EE Top-Up £20',           category: 'Mobile Top-Up', pricing: { costPrice: 20.00,  retailPrice: 20.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'EE' },
    { barcode: 'TOPUP-VF-5',   name: 'Vodafone Top-Up £5',      category: 'Mobile Top-Up', pricing: { costPrice: 5.00,   retailPrice: 5.00,   vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'Vodafone' },
    { barcode: 'TOPUP-VF-10',  name: 'Vodafone Top-Up £10',     category: 'Mobile Top-Up', pricing: { costPrice: 10.00,  retailPrice: 10.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'Vodafone' },
    { barcode: 'TOPUP-VF-20',  name: 'Vodafone Top-Up £20',     category: 'Mobile Top-Up', pricing: { costPrice: 20.00,  retailPrice: 20.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'Vodafone' },
    { barcode: 'TOPUP-O2-5',   name: 'O2 Top-Up £5',            category: 'Mobile Top-Up', pricing: { costPrice: 5.00,   retailPrice: 5.00,   vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'O2' },
    { barcode: 'TOPUP-O2-10',  name: 'O2 Top-Up £10',           category: 'Mobile Top-Up', pricing: { costPrice: 10.00,  retailPrice: 10.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'O2' },
    { barcode: 'TOPUP-O2-20',  name: 'O2 Top-Up £20',           category: 'Mobile Top-Up', pricing: { costPrice: 20.00,  retailPrice: 20.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'O2' },
    { barcode: 'TOPUP-3-5',    name: 'Three Top-Up £5',          category: 'Mobile Top-Up', pricing: { costPrice: 5.00,   retailPrice: 5.00,   vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'Three' },
    { barcode: 'TOPUP-3-10',   name: 'Three Top-Up £10',         category: 'Mobile Top-Up', pricing: { costPrice: 10.00,  retailPrice: 10.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'Three' },
    { barcode: 'TOPUP-3-20',   name: 'Three Top-Up £20',         category: 'Mobile Top-Up', pricing: { costPrice: 20.00,  retailPrice: 20.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'Three' },
    { barcode: 'TOPUP-GG-10',  name: 'giffgaff Top-Up £10',     category: 'Mobile Top-Up', pricing: { costPrice: 10.00,  retailPrice: 10.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'giffgaff' },
    { barcode: 'TOPUP-SKY-10', name: 'Sky Mobile Top-Up £10',   category: 'Mobile Top-Up', pricing: { costPrice: 10.00,  retailPrice: 10.00,  vatRate: 'zero' }, stock: { quantity: 999, lowStockThreshold: 0 }, attributes: { ageRestricted: false }, brand: 'Sky Mobile' },
  ];

  const products = [];
  for (const p of productsRaw) {
    const product = await Product.create({ store: store._id, ...p, isActive: true, pricing: { ...p.pricing, priceIncludesVat: true } });
    products.push(product);
  }
  logger.info(`Created ${products.length} products`);

  // ── CUSTOMERS ─────────────────────────────────────────────────────────────
  const customersRaw = [
    { firstName: 'Mohammed', lastName: 'Ali',      phone: '07700900001', loyalty: { points: 450, tier: 'bronze', enrolled: true, tierMultiplier: 1 } },
    { firstName: 'Priya',    lastName: 'Sharma',   phone: '07700900002', email: 'priya@example.com', loyalty: { points: 1200, tier: 'gold', enrolled: true, tierMultiplier: 1.5 }, marketing: { emailOptIn: true } },
    { firstName: 'David',    lastName: 'Wilson',   phone: '07700900003', loyalty: { points: 780, tier: 'silver', enrolled: true, tierMultiplier: 1.25 } },
    { firstName: 'Fatima',   lastName: 'Khan',     phone: '07700900004', loyalty: { points: 120, tier: 'bronze', enrolled: true, tierMultiplier: 1 } },
    { firstName: 'John',     lastName: "O'Brien",  phone: '07700900005', email: 'john@example.com', loyalty: { points: 3500, tier: 'platinum', enrolled: true, tierMultiplier: 2 }, marketing: { emailOptIn: true } },
    { firstName: 'Sandra',   lastName: 'Lee',      phone: '07700900006', loyalty: { points: 0, tier: 'bronze', enrolled: false } },
    { firstName: 'Arjun',    lastName: 'Patel',    phone: '07700900007', loyalty: { points: 240, tier: 'bronze', enrolled: true, tierMultiplier: 1 } },
    { firstName: 'Claire',   lastName: 'Murphy',   phone: '07700900008', loyalty: { points: 560, tier: 'silver', enrolled: true, tierMultiplier: 1.25 } },
    { firstName: 'Kwame',    lastName: 'Asante',   phone: '07700900009', loyalty: { points: 0, tier: 'bronze', enrolled: false } },
    { firstName: 'Emma',     lastName: 'Thompson', phone: '07700900010', email: 'emma@example.com', loyalty: { points: 980, tier: 'gold', enrolled: true, tierMultiplier: 1.5 }, marketing: { emailOptIn: true } },
  ];

  const customers = [];
  for (const c of customersRaw) {
    const customer = await Customer.create({ store: store._id, customerCode: generateCustomerCode(), ...c });
    customers.push(customer);
  }
  logger.info(`Created ${customers.length} customers`);

  // ── SUPPLIERS ─────────────────────────────────────────────────────────────
  const suppliersRaw = [
    { name: 'Booker Wholesale', code: 'BOOK01', type: 'cash-and-carry', contact: { phone: '01234 567890', email: 'orders@booker.co.uk' }, ordering: { minimumOrder: 100, deliveryDays: [1,3,5], leadTime: 1 } },
    { name: 'Bestway Wholesale', code: 'BEST01', type: 'cash-and-carry', contact: { phone: '01234 567891' }, ordering: { minimumOrder: 75, deliveryDays: [1,2,3,4,5] } },
    { name: 'Dhamecha', code: 'DHAM01', type: 'wholesaler', contact: { phone: '01234 567892' }, ordering: { minimumOrder: 50, deliveryDays: [2,4], leadTime: 2 } },
    { name: 'JW Filshill', code: 'FILS01', type: 'wholesaler', contact: { phone: '01234 567893' }, ordering: { minimumOrder: 100 } },
    { name: 'Nisa', code: 'NISA01', type: 'distributor', contact: { phone: '01234 567894', email: 'orders@nisa.co.uk' } },
    { name: 'Palmer & Harvey', code: 'PH01', type: 'distributor', contact: { phone: '01234 567895' } },
  ];

  const suppliers = [];
  for (const s of suppliersRaw) {
    const supplier = await Supplier.create({ store: store._id, ...s });
    suppliers.push(supplier);
  }
  logger.info(`Created ${suppliers.length} suppliers`);

  // ── PROMOTIONS ────────────────────────────────────────────────────────────
  const now = new Date();
  const in30days = new Date(now); in30days.setDate(in30days.getDate() + 30);

  const promos = await Promotion.insertMany([
    { store: store._id, name: '3 Cans for £5', type: 'multi-buy', applicableTo: { type: 'categories', categories: ['Beer'] }, params: { buyQuantity: 3, forPrice: 5.00 }, startDate: now, endDate: in30days, isActive: true, autoApply: true, priority: 10 },
    { store: store._id, name: '10% Off Spirits', type: 'percentage', applicableTo: { type: 'categories', categories: ['Spirits'] }, params: { percentOff: 10 }, startDate: now, endDate: in30days, isActive: true, autoApply: true, priority: 5 },
    { store: store._id, name: 'Buy 2 Crisps Get 1 Free', type: 'bogof', applicableTo: { type: 'categories', categories: ['Snacks'] }, params: { buyQuantity: 2, getQuantity: 1 }, startDate: now, endDate: in30days, isActive: true, autoApply: true, priority: 8 },
    { store: store._id, name: '£1 Off Pringles', type: 'fixed', applicableTo: { type: 'products', barcodes: ['5000232115011'] }, params: { amountOff: 1.00 }, startDate: now, endDate: in30days, isActive: true, autoApply: true, priority: 3 },
    { store: store._id, name: 'Spend £25 Save £2', type: 'spend-threshold', applicableTo: { type: 'all' }, params: { spendAmount: 25, discountAmount: 2.00 }, startDate: now, endDate: in30days, isActive: true, autoApply: true, priority: 1 },
  ]);
  logger.info(`Created ${promos.length} promotions`);

  // ── GIFT CARDS ────────────────────────────────────────────────────────────
  await GiftCard.insertMany([
    { store: store._id, code: 'GIFT-0001-TEST-XMAS', originalAmount: 25.00, currentBalance: 25.00, type: 'standard', status: 'active', customer: customers[0]._id, issuedBy: staffMembers[0]._id, issuedAt: now },
    { store: store._id, code: 'GIFT-0002-TEST-BDAY', originalAmount: 10.00, currentBalance: 10.00, type: 'standard', status: 'active', issuedBy: staffMembers[0]._id, issuedAt: now },
  ]);
  logger.info('Created 2 gift cards');

  // ── CASH DRAWER ───────────────────────────────────────────────────────────
  const drawer = await CashDrawer.create({
    store: store._id,
    tillId: 'TILL-1',
    status: 'open',
    openingFloat: 150.00,
    expectedAmount: 150.00,
    targetFloat: 150,
    alertThreshold: 300,
    currentShift: { staffId: staffMembers[1]._id, staffName: 'Sarah Jones', startedAt: now, openingAmount: 150.00 },
    dayStartedAt: now,
  });
  logger.info('Created cash drawer (TILL-1, open, float: £150.00)');

  // ── HISTORICAL SALES (50) ─────────────────────────────────────────────────
  const productList = products.filter((p) => !p.attributes.ageRestricted);
  const alcoholProducts = products.filter((p) => p.attributes.ageRestricted);
  let salesCreated = 0;

  for (let i = 0; i < 50; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const saleDate = new Date(now);
    saleDate.setDate(saleDate.getDate() - daysAgo);
    saleDate.setHours(7 + Math.floor(Math.random() * 16), Math.floor(Math.random() * 60), 0, 0);

    const staff = staffMembers[Math.floor(Math.random() * staffMembers.length)];
    const customer = Math.random() > 0.4 ? customers[Math.floor(Math.random() * customers.length)] : null;

    const numItems = 1 + Math.floor(Math.random() * 5);
    const saleItems = [];
    let subtotal = 0;

    for (let j = 0; j < numItems; j++) {
      const includeAlcohol = Math.random() > 0.5;
      const pool = includeAlcohol && alcoholProducts.length > 0 ? alcoholProducts : productList;
      const product = pool[Math.floor(Math.random() * pool.length)];
      const quantity = 1 + Math.floor(Math.random() * 3);
      const lineTotal = Math.round(product.pricing.retailPrice * quantity * 100) / 100;
      subtotal += lineTotal;
      saleItems.push({
        product: product._id,
        barcode: product.barcode,
        name: product.name,
        category: product.category,
        quantity,
        unitPrice: product.pricing.retailPrice,
        costPrice: product.pricing.costPrice,
        lineTotal,
        vatRate: product.pricing.vatRate,
        vatAmount: product.pricing.vatRate === 'standard' ? Math.round(lineTotal / 6 * 100) / 100 : 0,
        ageVerified: product.attributes.ageRestricted,
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const total = subtotal;
    const useCash = Math.random() > 0.4;
    const payments = [{ method: useCash ? 'cash' : 'card', amount: total, cardLast4: useCash ? undefined : '4242', cardType: useCash ? undefined : 'Visa' }];
    const cashDetails = useCash ? { tendered: Math.ceil(total), change: Math.round((Math.ceil(total) - total) * 100) / 100 } : undefined;

    const todaySaleCount = await Sale.countDocuments({ store: store._id, completedAt: { $gte: new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate()) } });
    const receiptNumber = `${saleDate.getFullYear()}${String(saleDate.getMonth()+1).padStart(2,'0')}${String(saleDate.getDate()).padStart(2,'0')}-${String(todaySaleCount + 1).padStart(4,'0')}`;

    await Sale.create({
      store: store._id,
      tillId: 'TILL-1',
      receiptNumber,
      staff: staff._id,
      staffName: staff.displayName,
      customer: customer ? customer._id : undefined,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : undefined,
      items: saleItems,
      subtotal,
      discountTotal: 0,
      vatBreakdown: [],
      total,
      payments,
      cashDetails,
      status: 'completed',
      isTraining: false,
      completedAt: saleDate,
    });
    salesCreated++;
  }
  logger.info(`Created ${salesCreated} historical sales`);

  logger.info('\n========================================');
  logger.info('SEED DATA COMPLETE!');
  logger.info('========================================');
  logger.info(`Store ID: ${store._id}`);
  logger.info('Login credentials:');
  logger.info('  Owner:      PIN 1111 | password: owner123');
  logger.info('  Manager:    PIN 2222 | password: manager123');
  logger.info('  Supervisor: PIN 3333');
  logger.info('  Cashier:    PIN 4444');
  logger.info('Test barcodes:');
  logger.info('  5449000000996 — Coca-Cola 330ml (no age restriction)');
  logger.info('  5010116030046 — Carling Lager (age restricted)');
  logger.info('========================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
