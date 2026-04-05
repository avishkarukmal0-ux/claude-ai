const Joi = require('joi');

const ukPostcode = Joi.string().pattern(/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i);
const ukPhone = Joi.string().pattern(/^(\+44|0)[1-9]\d{8,9}$/);
const gbpAmount = Joi.number().min(0).precision(2);

const loginSchema = Joi.object({
  employeeId: Joi.string().optional(),
  email: Joi.string().email().optional(),
  pin: Joi.string().min(4).max(8).optional(),
  password: Joi.string().min(6).optional(),
  storeId: Joi.string().required(),
}).or('employeeId', 'email');

const pinVerifySchema = Joi.object({
  pin: Joi.string().required(),
  storeId: Joi.string().required(),
  action: Joi.string().optional(),
});

const productCreateSchema = Joi.object({
  barcode: Joi.string().required(),
  sku: Joi.string().optional(),
  name: Joi.string().required(),
  shortName: Joi.string().optional(),
  description: Joi.string().optional(),
  category: Joi.string().required(),
  subcategory: Joi.string().optional(),
  brand: Joi.string().optional(),
  supplier: Joi.string().optional(),
  pricing: Joi.object({
    costPrice: gbpAmount.default(0),
    retailPrice: gbpAmount.required(),
    salePrice: gbpAmount.optional(),
    vatRate: Joi.string().valid('standard', 'reduced', 'zero').default('standard'),
    priceIncludesVat: Joi.boolean().default(true),
  }).required(),
  stock: Joi.object({
    quantity: Joi.number().integer().default(0),
    lowStockThreshold: Joi.number().integer().default(5),
    reorderPoint: Joi.number().integer().optional(),
    reorderQuantity: Joi.number().integer().optional(),
    location: Joi.string().optional(),
  }).optional(),
  attributes: Joi.object({
    size: Joi.string().optional(),
    unit: Joi.string().optional(),
    weight: Joi.number().optional(),
    isWeighed: Joi.boolean().default(false),
    ageRestricted: Joi.boolean().default(false),
    minimumAge: Joi.number().integer().default(18),
    requiresChallenge25: Joi.boolean().default(false),
  }).optional(),
  isActive: Joi.boolean().default(true),
});

const saleCreateSchema = Joi.object({
  tillId: Joi.string().default('TILL-1'),
  customerId: Joi.string().optional(),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().optional(),
      barcode: Joi.string().optional(),
      quantity: Joi.number().positive().required(),
      discount: Joi.object({
        type: Joi.string().valid('percent', 'fixed').optional(),
        amount: Joi.number().min(0).optional(),
        reason: Joi.string().optional(),
        authorisedBy: Joi.string().optional(),
      }).optional(),
      ageVerified: Joi.boolean().default(false),
    })
  ).min(1).required(),
  payments: Joi.array().items(
    Joi.object({
      method: Joi.string()
        .valid('cash', 'card', 'contactless', 'gift_card', 'loyalty_points', 'voucher', 'account', 'open_banking')
        .required(),
      amount: gbpAmount.required(),
      reference: Joi.string().optional(),
      giftCardCode: Joi.string().optional(),
      cardLast4: Joi.string().optional(),
      cardType: Joi.string().optional(),
    })
  ).min(1).required(),
  cashDetails: Joi.object({
    tendered: gbpAmount.optional(),
    change: gbpAmount.optional(),
  }).optional(),
  promoCode: Joi.string().optional(),
  loyaltyPointsToRedeem: Joi.number().integer().min(0).optional(),
  isTraining: Joi.boolean().default(false),
});

const customerCreateSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  phone: ukPhone.optional(),
  email: Joi.string().email().optional(),
  dateOfBirth: Joi.date().optional(),
  marketing: Joi.object({
    emailOptIn: Joi.boolean().default(false),
    smsOptIn: Joi.boolean().default(false),
  }).optional(),
  notes: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
});

const staffCreateSchema = Joi.object({
  employeeId: Joi.string().required(),
  displayName: Joi.string().required(),
  email: Joi.string().email().optional(),
  phone: ukPhone.optional(),
  pin: Joi.string().min(4).max(8).required(),
  duressPin: Joi.string().min(4).max(8).optional(),
  password: Joi.string().min(6).optional(),
  role: Joi.string().valid('cashier', 'supervisor', 'manager', 'owner').default('cashier'),
  permissions: Joi.object({
    canVoid: Joi.boolean(),
    canRefund: Joi.boolean(),
    canDiscount: Joi.boolean(),
    canOpenDrawer: Joi.boolean(),
    canViewReports: Joi.boolean(),
    canManageProducts: Joi.boolean(),
    canManageStaff: Joi.boolean(),
    maxDiscountPercent: Joi.number().min(0).max(100),
    maxRefundAmount: Joi.number().min(0),
  }).optional(),
  payroll: Joi.object({
    hourlyRate: Joi.number().min(0),
    overtimeRate: Joi.number().min(0),
    weeklyHours: Joi.number().default(40),
  }).optional(),
});

const cashDrawerOpenSchema = Joi.object({
  tillId: Joi.string().default('TILL-1'),
  openingFloat: gbpAmount.required(),
  notes: Joi.string().optional(),
});

module.exports = {
  loginSchema,
  pinVerifySchema,
  productCreateSchema,
  saleCreateSchema,
  customerCreateSchema,
  staffCreateSchema,
  cashDrawerOpenSchema,
};
