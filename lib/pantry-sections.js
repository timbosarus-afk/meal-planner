const ALWAYS_SECTIONS = ['Spices & Herbs', 'Oils, Sauces & Condiments', 'Baking & Dry Goods'];
const STOCK_SECTIONS = ['Fridge', 'Freezer', 'Cupboard'];
const ALL_SECTIONS = [...ALWAYS_SECTIONS, ...STOCK_SECTIONS];

const RULES = [
  [/\b(salt|pepper|cumin|paprika|cinnamon|nutmeg|allspice|turmeric|oregano|thyme|basil|bay|rosemary|chilli flakes|coriander seed|garam masala|curry powder|herbs?|spice|mixed spice|cayenne|fennel seed|mustard seed|stock cube)\b/, 'Spices & Herbs'],
  [/\b(oil|vinegar|sauce|ketchup|mayo|mayonnaise|mustard|soy|honey|syrup|puree|paste|wine|dressing|chutney|jam|worcestershire|pesto)\b/, 'Oils, Sauces & Condiments'],
  [/\b(flour|sugar|baking|yeast|cornflour|cocoa|lentil|rice|pasta|noodle|oats?|couscous|tin|tinned|canned|sheets?|breadcrumb|cereal|beans?|chickpeas?|stock)\b/, 'Baking & Dry Goods']
];
const FRIDGE = /\b(milk|butter|cheese|yoghurt|yogurt|cream|egg|sausage|bacon|ham|chicken|beef|pork|lamb|mince|salmon|fish|prawn|lettuce|salad|tomato|pepper|onion|garlic|carrot|potato|veg|fruit|mushroom|courgette|aubergine|spinach|chilli|lemon|lime|avocado|ricotta|mozzarella|parmesan|tofu)\b/;
const FREEZER = /\b(frozen|ice cream|peas|fish fingers|chips|sweetcorn)\b/;

function guessSection(name, kind) {
  const n = String(name || '').toLowerCase();
  if (kind === 'stock') {
    if (FREEZER.test(n)) return 'Freezer';
    if (FRIDGE.test(n)) return 'Fridge';
    return 'Cupboard';
  }
  for (const [re, sec] of RULES) if (re.test(n)) return sec;
  return 'Baking & Dry Goods';
}
module.exports = { ALWAYS_SECTIONS, STOCK_SECTIONS, ALL_SECTIONS, guessSection };
