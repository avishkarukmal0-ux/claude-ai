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
const MarketTrend = require('../models/MarketTrend');
const Expense = require('../models/Expense');
const AccountingSettings = require('../models/AccountingSettings');
const MarginSettings = require('../models/MarginSettings');
const { UK_DEFAULTS } = require('../services/marginService');
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

  // ── SUBSCRIPTION ──────────────────────────────────────────────────────────
  const { model: Subscription } = require('../models/Subscription');
  await Subscription.createTrial(store._id);
  logger.info('Trial subscription created');

  // ── STAFF ─────────────────────────────────────────────────────────────────
  const staffData = [
    { employeeId: 'EMP001', displayName: 'Raj Patel',  email: 'raj@rajsofflicence.co.uk', pin: '1111', password: 'owner123',   role: 'owner',      permissions: { canVoid: true, canRefund: true, canDiscount: true, canViewReports: true, canManageProducts: true, canManageStaff: true, maxDiscountPercent: 100, maxRefundAmount: 9999 }, payroll: { hourlyRate: 15.00, weeklyHours: 40 } },
    { employeeId: 'EMP002', displayName: 'Sarah Jones', email: 'sarah@rajsofflicence.co.uk', pin: '2222', password: 'manager123', role: 'manager',    permissions: { canVoid: true, canRefund: true, canDiscount: true, canViewReports: true, canManageProducts: true, canManageStaff: true, maxDiscountPercent: 50, maxRefundAmount: 500 }, payroll: { hourlyRate: 13.00, weeklyHours: 35 } },
    { employeeId: 'EMP003', displayName: 'Tom Brown',  pin: '3333', role: 'supervisor', permissions: { canVoid: true, canRefund: true, canDiscount: true, canViewReports: true, maxDiscountPercent: 20, maxRefundAmount: 100 }, payroll: { hourlyRate: 12.21, weeklyHours: 30 } },
    { employeeId: 'EMP004', displayName: 'Lisa Ahmed', pin: '4444', role: 'cashier',    permissions: { canVoid: false, canRefund: false, canDiscount: false, canOpenDrawer: true, maxDiscountPercent: 0, maxRefundAmount: 0 }, payroll: { hourlyRate: 12.50, weeklyHours: 20 } },
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

  // ── EXPIRY BATCHES ─────────────────────────────────────────────────────────
  const ExpiryMarkdownRule = require('../models/ExpiryMarkdownRule');
  const { Types: { ObjectId: ObjId } } = require('mongoose');

  // Default markdown rules for the store
  await ExpiryMarkdownRule.insertMany([
    { store: store._id, daysBeforeExpiry: 3, discountType: 'percentage', discountAmount: 20, active: true },
    { store: store._id, daysBeforeExpiry: 1, discountType: 'percentage', discountAmount: 40, active: true },
    { store: store._id, daysBeforeExpiry: 0, discountType: 'percentage', discountAmount: 50, active: true },
  ]);
  logger.info('Default expiry markdown rules created');

  // Helper: today + N days
  const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(23, 59, 0, 0); return d; };

  // Add expiry batches to specific products for testing
  const expiryData = [
    // 3 items expiring TODAY (for immediate testing)
    { barcode: '5010116030046', batches: [{ quantity: 12, expiryDate: daysFromNow(0), status: 'expiring_soon', costPrice: 0.65 }] }, // Carling 440ml
    { barcode: '5449000000996', batches: [{ quantity: 24, expiryDate: daysFromNow(0), status: 'expiring_soon', costPrice: 0.28 }] }, // Coca-Cola 330ml
    { barcode: '7622210100054', batches: [{ quantity: 8,  expiryDate: daysFromNow(0), status: 'expiring_soon', costPrice: 0.90 }] }, // Cadbury Dairy Milk

    // 5 items expiring in 2 days
    { barcode: '5000267013008', batches: [{ quantity: 18, expiryDate: daysFromNow(2), status: 'expiring_soon', costPrice: 0.85 }] }, // Stella Artois
    { barcode: '5449000133328', batches: [{ quantity: 36, expiryDate: daysFromNow(2), status: 'expiring_soon', costPrice: 0.25 }] }, // Sprite
    { barcode: '5000159461122', batches: [{ quantity: 20, expiryDate: daysFromNow(2), status: 'expiring_soon', costPrice: 0.28 }] }, // KitKat
    { barcode: '5000328530012', batches: [{ quantity: 30, expiryDate: daysFromNow(2), status: 'expiring_soon', costPrice: 0.20 }] }, // Walkers Ready Salted
    { barcode: '5010251012405', batches: [{ quantity: 12, expiryDate: daysFromNow(2), status: 'expiring_soon', costPrice: 0.65 }] }, // Red Bull

    // 2 items with normal/upcoming expiry (this week)
    { barcode: '5000267024004', batches: [{ quantity: 24, expiryDate: daysFromNow(5), status: 'ok', costPrice: 0.80 }] }, // Heineken
    { barcode: '5449000054227', batches: [{ quantity: 12, expiryDate: daysFromNow(6), status: 'ok', costPrice: 0.95 }] }, // Coca-Cola 1.75L
  ];

  for (const { barcode, batches } of expiryData) {
    const batched = batches.map(b => ({ batchId: new ObjId().toHexString(), receivedDate: new Date(), ...b }));
    await Product.updateOne({ store: store._id, barcode }, { $push: { expiryBatches: { $each: batched } } });
  }
  logger.info(`Added expiry batches to ${expiryData.length} products`);

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

  // ── MARKET TRENDS ─────────────────────────────────────────────────────────
  await MarketTrend.deleteMany({});
  await MarketTrend.insertMany([
    // Viral / Very High Trend
    { category: 'Energy Drinks', productName: 'Prime Energy Drink', brand: 'Prime', trendScore: 97, trendDirection: 'viral', searchVolume: 9200, searchVolumeChange: 340, avgRetailPrice: 1.99, estimatedCostPrice: 0.95, estimatedMargin: 52, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['viral','gen_z','influencer'], seasonalFactors: [{ month: 6, multiplier: 1.4 },{ month: 7, multiplier: 1.5 }] },
    { category: 'Vapes', productName: 'Elf Bar Disposable Vape', brand: 'Elf Bar', trendScore: 91, trendDirection: 'viral', searchVolume: 8800, searchVolumeChange: 280, avgRetailPrice: 5.99, estimatedCostPrice: 2.20, estimatedMargin: 63, suggestedSupplier: 'Bestway', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['viral','vapes','tobacco_alt'], seasonalFactors: [] },
    { category: 'Energy Drinks', productName: 'Ghost Energy Drink', brand: 'Ghost', trendScore: 85, trendDirection: 'rising', searchVolume: 5400, searchVolumeChange: 180, avgRetailPrice: 1.79, estimatedCostPrice: 0.80, estimatedMargin: 55, suggestedSupplier: 'Costco', relevantFor: ['off_licence','convenience'], region: 'UK', source: 'google_trends', tags: ['gen_z','fitness','viral'], seasonalFactors: [] },
    { category: 'Health', productName: 'Grenade Protein Bar', brand: 'Grenade', trendScore: 82, trendDirection: 'rising', searchVolume: 4100, searchVolumeChange: 95, avgRetailPrice: 1.49, estimatedCostPrice: 0.65, estimatedMargin: 56, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['health','protein','gym'], seasonalFactors: [{ month: 1, multiplier: 1.6 },{ month: 9, multiplier: 1.3 }] },

    // Rising trends
    { category: 'Alcohol Free', productName: 'Heineken 0.0% Beer', brand: 'Heineken', trendScore: 79, trendDirection: 'rising', searchVolume: 3800, searchVolumeChange: 72, avgRetailPrice: 1.20, estimatedCostPrice: 0.55, estimatedMargin: 54, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience'], region: 'UK', source: 'google_trends', tags: ['alcohol_free','health','dry_january'], seasonalFactors: [{ month: 1, multiplier: 2.8 },{ month: 8, multiplier: 1.2 }] },
    { category: 'Health', productName: 'Kombucha GT\'s Original', brand: 'GT\'s', trendScore: 74, trendDirection: 'rising', searchVolume: 2900, searchVolumeChange: 58, avgRetailPrice: 2.49, estimatedCostPrice: 1.10, estimatedMargin: 56, suggestedSupplier: 'Costco', relevantFor: ['off_licence','convenience'], region: 'UK', source: 'google_trends', tags: ['health','probiotic','wellness'], seasonalFactors: [] },
    { category: 'Soft Drinks', productName: 'Fever-Tree Sparkling Water', brand: 'Fever-Tree', trendScore: 72, trendDirection: 'rising', searchVolume: 2600, searchVolumeChange: 44, avgRetailPrice: 1.29, estimatedCostPrice: 0.55, estimatedMargin: 57, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['premium','sparkling','health'], seasonalFactors: [{ month: 6, multiplier: 1.5 },{ month: 7, multiplier: 1.6 }] },
    { category: 'Vapes', productName: 'Lost Mary Disposable Vape', brand: 'Lost Mary', trendScore: 71, trendDirection: 'rising', searchVolume: 3100, searchVolumeChange: 110, avgRetailPrice: 5.49, estimatedCostPrice: 2.00, estimatedMargin: 64, suggestedSupplier: 'Bestway', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['vapes','tobacco_alt'], seasonalFactors: [] },
    { category: 'Dairy Alt', productName: 'Oatly Barista Oat Milk', brand: 'Oatly', trendScore: 69, trendDirection: 'rising', searchVolume: 2200, searchVolumeChange: 38, avgRetailPrice: 1.80, estimatedCostPrice: 0.85, estimatedMargin: 53, suggestedSupplier: 'Costco', relevantFor: ['convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['health','dairy_free','vegan'], seasonalFactors: [] },

    // Stable / Steady
    { category: 'Beer', productName: 'Stella Artois 330ml Bottle', brand: 'Stella Artois', trendScore: 68, trendDirection: 'stable', searchVolume: 6500, searchVolumeChange: 3, avgRetailPrice: 1.50, estimatedCostPrice: 0.70, estimatedMargin: 53, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience'], region: 'UK', source: 'internal', tags: ['beer','premium'], seasonalFactors: [{ month: 6, multiplier: 1.4 },{ month: 7, multiplier: 1.5 },{ month: 8, multiplier: 1.4 }] },
    { category: 'Snacks', productName: 'Walkers Max Crisps 65g', brand: 'Walkers', trendScore: 66, trendDirection: 'stable', searchVolume: 4200, searchVolumeChange: 5, avgRetailPrice: 1.19, estimatedCostPrice: 0.52, estimatedMargin: 56, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'internal', tags: ['snacks','sharing'], seasonalFactors: [] },
    { category: 'Chocolate', productName: 'Cadbury Caramilk 90g', brand: 'Cadbury', trendScore: 65, trendDirection: 'rising', searchVolume: 3100, searchVolumeChange: 29, avgRetailPrice: 1.09, estimatedCostPrice: 0.48, estimatedMargin: 56, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['chocolate','new','limited'], seasonalFactors: [{ month: 10, multiplier: 1.3 },{ month: 12, multiplier: 1.5 }] },
    { category: 'Soft Drinks', productName: 'Celsius Energy Drink', brand: 'Celsius', trendScore: 63, trendDirection: 'rising', searchVolume: 2800, searchVolumeChange: 67, avgRetailPrice: 1.69, estimatedCostPrice: 0.75, estimatedMargin: 56, suggestedSupplier: 'Costco', relevantFor: ['off_licence','convenience'], region: 'UK', source: 'google_trends', tags: ['fitness','health','gen_z'], seasonalFactors: [] },

    // New entrants
    { category: 'Alcohol Free', productName: 'Lucky Saint Unfiltered Lager', brand: 'Lucky Saint', trendScore: 62, trendDirection: 'new', searchVolume: 1400, searchVolumeChange: 290, avgRetailPrice: 1.59, estimatedCostPrice: 0.72, estimatedMargin: 55, suggestedSupplier: 'Bestway', relevantFor: ['off_licence','convenience'], region: 'UK', source: 'google_trends', tags: ['alcohol_free','premium','new'], seasonalFactors: [{ month: 1, multiplier: 2.5 }] },
    { category: 'Health', productName: 'Pip & Nut Peanut Butter Cups', brand: 'Pip & Nut', trendScore: 61, trendDirection: 'new', searchVolume: 1200, searchVolumeChange: 220, avgRetailPrice: 1.29, estimatedCostPrice: 0.58, estimatedMargin: 55, suggestedSupplier: 'Costco', relevantFor: ['convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['health','protein','new'], seasonalFactors: [] },
    { category: 'Snacks', productName: 'Takis Fuego 160g', brand: 'Takis', trendScore: 78, trendDirection: 'viral', searchVolume: 4300, searchVolumeChange: 190, avgRetailPrice: 1.99, estimatedCostPrice: 0.85, estimatedMargin: 57, suggestedSupplier: 'Costco', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['viral','gen_z','spicy','tiktok'], seasonalFactors: [] },

    // Falling
    { category: 'Tobacco', productName: 'Marlboro Gold 20s', brand: 'Marlboro', trendScore: 58, trendDirection: 'falling', searchVolume: 7200, searchVolumeChange: -18, avgRetailPrice: 12.50, estimatedCostPrice: 11.20, estimatedMargin: 10, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'internal', tags: ['tobacco'], seasonalFactors: [] },
    { category: 'Soft Drinks', productName: 'Lucozade Energy Original 500ml', brand: 'Lucozade', trendScore: 55, trendDirection: 'falling', searchVolume: 3800, searchVolumeChange: -12, avgRetailPrice: 1.29, estimatedCostPrice: 0.58, estimatedMargin: 55, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'internal', tags: ['energy','classic'], seasonalFactors: [] },

    // Seasonal Specifics
    { category: 'Halal / Ethnic', productName: 'Medjool Dates 500g', brand: 'Various', trendScore: 88, trendDirection: 'rising', searchVolume: 5600, searchVolumeChange: 240, avgRetailPrice: 3.99, estimatedCostPrice: 1.80, estimatedMargin: 55, suggestedSupplier: 'Bestway', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'google_trends', tags: ['ramadan','halal','seasonal'], seasonalFactors: [{ month: 3, multiplier: 4.0 },{ month: 4, multiplier: 3.5 }] },
    { category: 'Sports Drinks', productName: 'Lucozade Sport Orange 500ml', brand: 'Lucozade', trendScore: 64, trendDirection: 'stable', searchVolume: 3200, searchVolumeChange: 8, avgRetailPrice: 1.29, estimatedCostPrice: 0.55, estimatedMargin: 57, suggestedSupplier: 'Booker', relevantFor: ['off_licence','convenience','newsagent'], region: 'UK', source: 'internal', tags: ['sports','hydration'], seasonalFactors: [{ month: 5, multiplier: 1.4 },{ month: 6, multiplier: 1.6 },{ month: 7, multiplier: 1.7 }] },
  ]);
  logger.info('Market trends seeded (20 products)');

  // ── ACCOUNTING SETTINGS ──────────────────────────────────────────────────
  await AccountingSettings.deleteMany({});
  await AccountingSettings.create({
    store: store._id,
    vat: {
      registered:      true,
      vatNumber:       'GB123456789',
      scheme:          'standard',
      returnFrequency: 'quarterly',
      quarterGroup:    'jan_apr_jul_oct',
    },
    financialYearStart: { month: 4, day: 6 },
    payroll: {
      enabled:             true,
      frequency:           'monthly',
      payDay:              25,
      payeReference:       '123/AB45678',
      accountsOfficeRef:   '123PX00000000',
      pensionProvider:     'NEST',
      pensionRateEmployee: 5,
      pensionRateEmployer: 3,
    },
  });
  logger.info('Accounting settings created');

  // ── SAMPLE EXPENSES ───────────────────────────────────────────────────────
  await Expense.deleteMany({});
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  await Expense.insertMany([
    // This month
    {
      store: store._id, date: new Date(now.getFullYear(), now.getMonth(), 1),
      category: 'rent_rates', description: 'Monthly shop rent — April 2026',
      supplier: 'Highstreet Property Ltd', netAmount: 1200.00, vatAmount: 0, grossAmount: 1200.00,
      vatRate: 0, vatReclaimable: false, paymentMethod: 'bacs', paymentStatus: 'paid',
      createdBy: staffMembers[0]._id,
    },
    {
      store: store._id, date: new Date(now.getFullYear(), now.getMonth(), 3),
      category: 'utilities', description: 'Electricity bill — April 2026',
      supplier: 'British Gas', netAmount: 155.83, vatAmount: 31.17, grossAmount: 187.00,
      vatRate: 20, vatReclaimable: true, paymentMethod: 'direct_debit', paymentStatus: 'paid',
      createdBy: staffMembers[0]._id,
    },
    {
      store: store._id, date: new Date(now.getFullYear(), now.getMonth(), 5),
      category: 'software', description: 'Vendora POS subscription — April 2026',
      supplier: 'Vendora Ltd', netAmount: 49.00, vatAmount: 9.80, grossAmount: 58.80,
      vatRate: 20, vatReclaimable: true, paymentMethod: 'card', paymentStatus: 'paid',
      createdBy: staffMembers[0]._id,
    },
    {
      store: store._id, date: new Date(now.getFullYear(), now.getMonth(), 7),
      category: 'insurance', description: 'Business insurance — annual instalment',
      supplier: 'Aviva Commercial', netAmount: 83.33, vatAmount: 0, grossAmount: 83.33,
      vatRate: 0, vatReclaimable: false, paymentMethod: 'direct_debit', paymentStatus: 'paid',
      createdBy: staffMembers[0]._id,
    },
    // Last month
    {
      store: store._id, date: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1),
      category: 'rent_rates', description: 'Monthly shop rent — March 2026',
      supplier: 'Highstreet Property Ltd', netAmount: 1200.00, vatAmount: 0, grossAmount: 1200.00,
      vatRate: 0, vatReclaimable: false, paymentMethod: 'bacs', paymentStatus: 'paid',
      createdBy: staffMembers[0]._id,
    },
    {
      store: store._id, date: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 3),
      category: 'utilities', description: 'Electricity bill — March 2026',
      supplier: 'British Gas', netAmount: 170.00, vatAmount: 34.00, grossAmount: 204.00,
      vatRate: 20, vatReclaimable: true, paymentMethod: 'direct_debit', paymentStatus: 'paid',
      createdBy: staffMembers[0]._id,
    },
    {
      store: store._id, date: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 15),
      category: 'repairs', description: 'CCTV system repair',
      supplier: 'SecureTech Ltd', netAmount: 120.00, vatAmount: 24.00, grossAmount: 144.00,
      vatRate: 20, vatReclaimable: true, paymentMethod: 'card', paymentStatus: 'paid',
      createdBy: staffMembers[0]._id,
    },
  ]);
  logger.info('Sample expenses created (7 records)');

  // ── MARGIN SETTINGS ──────────────────────────────────────────────────────
  await MarginSettings.deleteMany({ store: store._id });
  await MarginSettings.create({
    store: store._id,
    defaultMargin: 30,
    categories: UK_DEFAULTS,
    alertBelowMinMargin: true,
    autoSuggestPrice: true,
    showMarginOnPOS: false,
  });
  logger.info('Margin settings seeded (UK c-store defaults)');

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
