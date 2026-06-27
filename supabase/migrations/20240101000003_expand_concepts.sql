-- =============================================================================
-- Expand concept list to ~300 words
--
-- Adds 256 new concepts (c_0045 → c_0300) to the existing 44.
-- Organised by category for easy review and future expansion.
--
-- Priority order:
--   1. Swadesh 207 completion  — the universal core every language must have
--   2. Dinka cultural          — cattle, seasons, community roles
--   3. Practical everyday      — numbers, time, greetings, verbs
--
-- swadesh_list = TRUE  → part of the Swadesh 207 basic word list
-- prompt_context       → shown to contributors when the English word is
--                        ambiguous (e.g. "fly" could be verb or insect)
-- =============================================================================

INSERT INTO concepts (id, english_gloss, swadesh_list, prompt_context) VALUES

-- ── Body parts (Swadesh completion) ──────────────────────────────────────────
('c_0045', 'tongue',       TRUE,  NULL),
('c_0046', 'nose',         TRUE,  NULL),
('c_0047', 'hair',         TRUE,  NULL),
('c_0048', 'blood',        TRUE,  NULL),
('c_0049', 'bone',         TRUE,  NULL),
('c_0050', 'skin',         TRUE,  'What is the word for skin — the covering of the human body?'),
('c_0051', 'heart',        TRUE,  NULL),
('c_0052', 'liver',        TRUE,  NULL),
('c_0053', 'belly',        TRUE,  'What is the word for belly or stomach?'),
('c_0054', 'back',         TRUE,  'What is the word for the back of your body?'),
('c_0055', 'neck',         TRUE,  NULL),
('c_0056', 'knee',         TRUE,  NULL),
('c_0057', 'arm',          FALSE, NULL),
('c_0058', 'leg',          TRUE,  NULL),
('c_0059', 'fingernail',   TRUE,  'What is the word for the nail at the end of a finger?'),
('c_0060', 'wing',         TRUE,  'What is the word for the wing of a bird?'),
('c_0061', 'tail',         TRUE,  NULL),
('c_0062', 'feather',      TRUE,  NULL),
('c_0063', 'shoulder',     FALSE, NULL),
('c_0064', 'chest',        FALSE, 'What is the word for the chest — the front of the body above the stomach?'),
('c_0065', 'finger',       FALSE, 'What is the word for a single finger?'),

-- ── Nature (Swadesh completion) ───────────────────────────────────────────────
('c_0066', 'stone',        TRUE,  'What is the word for a stone or rock?'),
('c_0067', 'earth',        TRUE,  'What is the word for earth or soil — the ground beneath your feet?'),
('c_0068', 'sand',         TRUE,  NULL),
('c_0069', 'cloud',        TRUE,  NULL),
('c_0070', 'smoke',        TRUE,  NULL),
('c_0071', 'ash',          TRUE,  'What is the word for the ash left after a fire burns out?'),
('c_0072', 'mountain',     TRUE,  'What is the word for a mountain or large hill?'),
('c_0073', 'path',         TRUE,  'What is the word for a path or road that people walk on?'),
('c_0074', 'lake',         TRUE,  NULL),
('c_0075', 'sea',          TRUE,  'What is the word for the sea or ocean?'),
('c_0076', 'night',        TRUE,  NULL),
('c_0077', 'day',          TRUE,  'What is the word for daytime — when the sun is up?'),
('c_0078', 'sky',          FALSE, NULL),
('c_0079', 'dust',         TRUE,  NULL),
('c_0080', 'mud',          FALSE, NULL),
('c_0081', 'storm',        FALSE, 'What is the word for a storm — heavy rain with strong wind?'),

-- ── Animals (Swadesh completion + culturally important) ───────────────────────
('c_0082', 'snake',        TRUE,  NULL),
('c_0083', 'worm',         TRUE,  NULL),
('c_0084', 'louse',        TRUE,  'What is the word for a louse — a tiny insect that lives in hair?'),
('c_0085', 'fly',          TRUE,  'What is the word for a fly — the small flying insect?'),
('c_0086', 'mosquito',     FALSE, NULL),
('c_0087', 'ant',          FALSE, NULL),
('c_0088', 'bee',          FALSE, NULL),
('c_0089', 'egg',          TRUE,  NULL),
('c_0090', 'horn',         TRUE,  'What is the word for an animal''s horn?'),
('c_0091', 'elephant',     FALSE, NULL),
('c_0092', 'lion',         FALSE, NULL),
('c_0093', 'crocodile',    FALSE, NULL),
('c_0094', 'hippopotamus', FALSE, 'What is the word for a hippopotamus?'),
('c_0095', 'monkey',       FALSE, NULL),
('c_0096', 'rat',          FALSE, 'What is the word for a rat or mouse?'),
('c_0097', 'sheep',        FALSE, NULL),
('c_0098', 'donkey',       FALSE, NULL),
('c_0099', 'chicken',      FALSE, 'What is the word for a chicken?'),

-- ── Plants (Swadesh) ─────────────────────────────────────────────────────────
('c_0100', 'leaf',         TRUE,  NULL),
('c_0101', 'root',         TRUE,  'What is the word for the root of a plant or tree?'),
('c_0102', 'tree bark',    TRUE,  'What is the word for the bark — the outer covering of a tree?'),
('c_0103', 'seed',         TRUE,  'What is the word for a seed that grows into a plant?'),
('c_0104', 'fruit',        TRUE,  NULL),
('c_0105', 'flower',       TRUE,  NULL),

-- ── Materials (Swadesh) ───────────────────────────────────────────────────────
('c_0106', 'rope',         TRUE,  NULL),
('c_0107', 'fat',          TRUE,  'What is the word for fat or grease — animal fat?'),
('c_0108', 'meat',         TRUE,  NULL),
('c_0109', 'wood',         TRUE,  'What is the word for wood or a wooden stick?'),

-- ── Core verbs (Swadesh completion) ──────────────────────────────────────────
('c_0110', 'die',          TRUE,  'What is the word for ''to die''?'),
('c_0111', 'kill',         TRUE,  'What is the word for ''to kill''?'),
('c_0112', 'come',         TRUE,  'What is the word for ''to come'' — to move towards this place?'),
('c_0113', 'give',         TRUE,  'What is the word for ''to give'' something to someone?'),
('c_0114', 'hear',         TRUE,  'What is the word for ''to hear'' a sound?'),
('c_0115', 'know',         TRUE,  'What is the word for ''to know'' something?'),
('c_0116', 'think',        TRUE,  'What is the word for ''to think''?'),
('c_0117', 'say',          TRUE,  'What is the word for ''to say'' something?'),
('c_0118', 'sit',          TRUE,  'What is the word for ''to sit'' down?'),
('c_0119', 'stand',        TRUE,  'What is the word for ''to stand'' up?'),
('c_0120', 'lie down',     TRUE,  'What is the word for ''to lie down'' — to rest flat?'),
('c_0121', 'run',          TRUE,  'What is the word for ''to run''?'),
('c_0122', 'fly',          TRUE,  'What is the word for ''to fly'' — the way a bird flies?'),
('c_0123', 'swim',         TRUE,  'What is the word for ''to swim''?'),
('c_0124', 'burn',         TRUE,  'What is the word for ''to burn'' — for fire to burn something?'),
('c_0125', 'fall',         TRUE,  'What is the word for ''to fall'' down?'),
('c_0126', 'flow',         TRUE,  'What is the word for water ''to flow'' — like a river flowing?'),
('c_0127', 'live',         TRUE,  'What is the word for ''to live'' — to be alive?'),
('c_0128', 'laugh',        TRUE,  'What is the word for ''to laugh''?'),
('c_0129', 'bite',         TRUE,  'What is the word for ''to bite''?'),
('c_0130', 'breathe',      TRUE,  'What is the word for ''to breathe''?'),
('c_0131', 'fear',         TRUE,  'What is the word for ''to fear'' or be afraid?'),
('c_0132', 'fight',        TRUE,  'What is the word for ''to fight''?'),

-- ── Adjectives (Swadesh completion) ──────────────────────────────────────────
('c_0133', 'bad',          TRUE,  NULL),
('c_0134', 'hot',          TRUE,  'What is the word for something that is hot or warm?'),
('c_0135', 'cold',         TRUE,  NULL),
('c_0136', 'new',          TRUE,  NULL),
('c_0137', 'old',          TRUE,  'What is the word for something that is old — like an old object (not an old person)?'),
('c_0138', 'full',         TRUE,  'What is the word for something that is full — like a full container?'),
('c_0139', 'dry',          TRUE,  NULL),
('c_0140', 'wet',          TRUE,  NULL),
('c_0141', 'long',         TRUE,  NULL),
('c_0142', 'short',        TRUE,  'What is the word for something short — not long?'),
('c_0143', 'near',         TRUE,  'What is the word for something that is near or close by?'),
('c_0144', 'far',          TRUE,  NULL),
('c_0145', 'heavy',        TRUE,  NULL),
('c_0146', 'sharp',        TRUE,  'What is the word for something sharp — like a sharp knife?'),
('c_0147', 'round',        TRUE,  NULL),
('c_0148', 'dirty',        TRUE,  NULL),
('c_0149', 'straight',     TRUE,  NULL),
('c_0150', 'wide',         TRUE,  NULL),
('c_0151', 'narrow',       TRUE,  'What is the word for something that is narrow — not wide?'),

-- ── Colours (Swadesh + common) ────────────────────────────────────────────────
('c_0152', 'white',        TRUE,  NULL),
('c_0153', 'black',        TRUE,  NULL),
('c_0154', 'red',          TRUE,  NULL),
('c_0155', 'green',        TRUE,  NULL),
('c_0156', 'yellow',       TRUE,  NULL),
('c_0157', 'blue',         FALSE, NULL),
('c_0158', 'brown',        FALSE, NULL),

-- ── Pronouns & question words (Swadesh) ──────────────────────────────────────
('c_0159', 'I',            TRUE,  'What is the word for ''I'' — when talking about yourself?'),
('c_0160', 'you',          TRUE,  'What is the word for ''you'' — talking to one person?'),
('c_0161', 'he',           TRUE,  'What is the word for ''he'' or ''she'' — one other person?'),
('c_0162', 'we',           TRUE,  'What is the word for ''we'' — yourself and others together?'),
('c_0163', 'they',         TRUE,  'What is the word for ''they'' — a group of other people?'),
('c_0164', 'this',         TRUE,  'What is the word for ''this'' — something right here close to you?'),
('c_0165', 'that',         TRUE,  'What is the word for ''that'' — something over there, away from you?'),
('c_0166', 'here',         TRUE,  'What is the word for ''here'' — this place where you are?'),
('c_0167', 'there',        TRUE,  'What is the word for ''there'' — that place away from you?'),
('c_0168', 'who',          TRUE,  'What is the word for ''who''?'),
('c_0169', 'what',         TRUE,  'What is the word for ''what''?'),
('c_0170', 'where',        TRUE,  'What is the word for ''where''?'),
('c_0171', 'when',         TRUE,  'What is the word for ''when''?'),
('c_0172', 'how',          TRUE,  'What is the word for ''how''?'),
('c_0173', 'all',          TRUE,  'What is the word for ''all'' or ''everything''?'),
('c_0174', 'many',         TRUE,  'What is the word for ''many'' or ''a lot''?'),
('c_0175', 'some',         TRUE,  'What is the word for ''some'' — a few but not all?'),
('c_0176', 'not',          TRUE,  'What is the word for ''not'' — used to say something is not true?'),
('c_0177', 'yes',          FALSE, NULL),
('c_0178', 'no',           FALSE, NULL),
('c_0179', 'if',           TRUE,  'What is the word for ''if'' — as in ''if this happens...''?'),
('c_0180', 'because',      TRUE,  'What is the word for ''because'' — explaining a reason?'),

-- ── Numbers (completion) ──────────────────────────────────────────────────────
('c_0181', 'four',         TRUE,  NULL),
('c_0182', 'five',         TRUE,  NULL),
('c_0183', 'six',          FALSE, NULL),
('c_0184', 'seven',        FALSE, NULL),
('c_0185', 'eight',        FALSE, NULL),
('c_0186', 'nine',         FALSE, NULL),
('c_0187', 'ten',          FALSE, NULL),
('c_0188', 'twenty',       FALSE, NULL),
('c_0189', 'one hundred',  FALSE, 'What is the word for one hundred (100)?'),

-- ── Family & kinship ─────────────────────────────────────────────────────────
('c_0190', 'husband',      FALSE, 'What is the word for a woman''s husband?'),
('c_0191', 'wife',         FALSE, 'What is the word for a man''s wife?'),
('c_0192', 'brother',      FALSE, 'What is the word for a brother?'),
('c_0193', 'sister',       FALSE, 'What is the word for a sister?'),
('c_0194', 'son',          FALSE, 'What is the word for someone''s son?'),
('c_0195', 'daughter',     FALSE, 'What is the word for someone''s daughter?'),
('c_0196', 'grandfather',  FALSE, NULL),
('c_0197', 'grandmother',  FALSE, NULL),
('c_0198', 'uncle',        FALSE, NULL),
('c_0199', 'aunt',         FALSE, NULL),
('c_0200', 'family',       FALSE, 'What is the word for your family — your relatives?'),

-- ── Cattle & Dinka cultural vocabulary ───────────────────────────────────────
-- Cattle are central to Dinka life and identity. These words are high priority.
('c_0201', 'bull',         FALSE, 'What is the word for a bull — an adult male cow?'),
('c_0202', 'calf',         FALSE, 'What is the word for a calf — a baby cow?'),
('c_0203', 'ox',           FALSE, 'What is the word for an ox — a male cow used for heavy work?'),
('c_0204', 'cattle camp',  FALSE, 'What is the word for the cattle camp — where people live with their cattle during the dry season?'),
('c_0205', 'cattle byre',  FALSE, 'What is the word for the enclosure where cattle sleep at night?'),
('c_0206', 'ghee',         FALSE, 'What is the word for ghee — clarified butter made from cow milk?'),
('c_0207', 'cattle dung',  FALSE, 'What is the word for cattle dung — used as fuel and ash?'),
('c_0208', 'herd cattle',  FALSE, 'What is the word for ''to herd'' or graze cattle?'),
('c_0209', 'bride wealth', FALSE, 'What is the word for the cattle paid to the bride''s family at marriage?'),

-- ── Food & drink ─────────────────────────────────────────────────────────────
('c_0210', 'sorghum',      FALSE, 'What is the word for sorghum — the grain crop used to make porridge?'),
('c_0211', 'porridge',     FALSE, 'What is the word for the thick porridge made from grain?'),
('c_0212', 'salt',         TRUE,  NULL),
('c_0213', 'oil',          FALSE, 'What is the word for cooking oil?'),
('c_0214', 'bean',         FALSE, NULL),
('c_0215', 'groundnut',    FALSE, 'What is the word for a groundnut or peanut?'),
('c_0216', 'honey',        FALSE, NULL),
('c_0217', 'vegetable',    FALSE, NULL),

-- ── Tools & household objects ─────────────────────────────────────────────────
('c_0218', 'knife',        FALSE, NULL),
('c_0219', 'spear',        FALSE, 'What is the word for a spear — a long pointed throwing weapon?'),
('c_0220', 'shield',       FALSE, 'What is the word for a shield — used in battle for protection?'),
('c_0221', 'cooking pot',  FALSE, 'What is the word for a cooking pot?'),
('c_0222', 'calabash',     FALSE, 'What is the word for a calabash or gourd used as a container?'),
('c_0223', 'mat',          FALSE, 'What is the word for a sleeping mat?'),
('c_0224', 'cloth',        FALSE, 'What is the word for cloth or clothing?'),
('c_0225', 'fishing',      FALSE, 'What is the word for fishing — catching fish from a river?'),

-- ── Community & social life ───────────────────────────────────────────────────
('c_0226', 'village',      FALSE, 'What is the word for a village — the area where your people live?'),
('c_0227', 'chief',        FALSE, 'What is the word for a chief — the community leader?'),
('c_0228', 'elder',        FALSE, 'What is the word for an elder — a respected older person in the community?'),
('c_0229', 'war',          FALSE, NULL),
('c_0230', 'peace',        FALSE, NULL),
('c_0231', 'dance',        FALSE, 'What is the word for a traditional dance?'),
('c_0232', 'song',         FALSE, NULL),
('c_0233', 'ceremony',     FALSE, 'What is the word for a traditional ceremony or ritual?'),
('c_0234', 'market',       FALSE, NULL),
('c_0235', 'friend',       FALSE, NULL),
('c_0236', 'enemy',        FALSE, NULL),
('c_0237', 'stranger',     FALSE, 'What is the word for a stranger — someone from outside the community?'),

-- ── Time ─────────────────────────────────────────────────────────────────────
('c_0238', 'today',        FALSE, 'What is the word for ''today''?'),
('c_0239', 'yesterday',    FALSE, 'What is the word for ''yesterday''?'),
('c_0240', 'tomorrow',     FALSE, 'What is the word for ''tomorrow''?'),
('c_0241', 'morning',      FALSE, NULL),
('c_0242', 'evening',      FALSE, NULL),
('c_0243', 'year',         TRUE,  NULL),
('c_0244', 'month',        FALSE, NULL),
('c_0245', 'dry season',   FALSE, 'What is the word for the dry season — when there is little or no rain?'),
('c_0246', 'rainy season', FALSE, 'What is the word for the rainy season — when it rains heavily?'),
('c_0247', 'now',          FALSE, 'What is the word for ''now'' — at this moment?'),
('c_0248', 'before',       FALSE, 'What is the word for ''before'' — in the past?'),
('c_0249', 'after',        FALSE, 'What is the word for ''after'' — later in time?'),

-- ── Land & environment ────────────────────────────────────────────────────────
('c_0250', 'flood',        FALSE, 'What is the word for a flood — when the river overflows and covers the land?'),
('c_0251', 'savannah',     FALSE, 'What is the word for the open grassland or savannah?'),
('c_0252', 'swamp',        FALSE, 'What is the word for a swamp or marshy area?'),
('c_0253', 'well',         FALSE, 'What is the word for a well — a hole dug to reach underground water?'),
('c_0254', 'farm',         FALSE, 'What is the word for a farm or field where crops are grown?'),
('c_0255', 'forest',       TRUE,  'What is the word for a forest or thick bush?'),

-- ── Descriptors ───────────────────────────────────────────────────────────────
('c_0256', 'tall',         FALSE, 'What is the word for someone or something that is tall?'),
('c_0257', 'fat',          FALSE, 'What is the word for someone who is fat or heavy?'),
('c_0258', 'thin',         FALSE, 'What is the word for someone who is thin?'),
('c_0259', 'beautiful',    FALSE, NULL),
('c_0260', 'strong',       FALSE, NULL),
('c_0261', 'sick',         FALSE, 'What is the word for being sick or ill?'),
('c_0262', 'hungry',       FALSE, 'What is the word for being hungry?'),
('c_0263', 'thirsty',      FALSE, 'What is the word for being thirsty?'),
('c_0264', 'tired',        FALSE, 'What is the word for being tired?'),
('c_0265', 'happy',        FALSE, NULL),
('c_0266', 'sad',          FALSE, 'What is the word for being sad or unhappy?'),
('c_0267', 'angry',        FALSE, 'What is the word for being angry?'),

-- ── Practical verbs ───────────────────────────────────────────────────────────
('c_0268', 'cook',         FALSE, 'What is the word for ''to cook'' food?'),
('c_0269', 'build',        FALSE, 'What is the word for ''to build'' — a house or structure?'),
('c_0270', 'buy',          FALSE, 'What is the word for ''to buy'' something?'),
('c_0271', 'sell',         FALSE, 'What is the word for ''to sell'' something?'),
('c_0272', 'plant',        FALSE, 'What is the word for ''to plant'' seeds or crops?'),
('c_0273', 'carry',        FALSE, 'What is the word for ''to carry'' something?'),
('c_0274', 'cut',          TRUE,  'What is the word for ''to cut'' something?'),
('c_0275', 'throw',        TRUE,  'What is the word for ''to throw'' something?'),
('c_0276', 'marry',        FALSE, 'What is the word for ''to marry'' — to get married?'),
('c_0277', 'pray',         FALSE, 'What is the word for ''to pray''?'),
('c_0278', 'call',         FALSE, 'What is the word for ''to call'' someone — by name or from a distance?'),
('c_0279', 'return',       FALSE, 'What is the word for ''to return'' — to go back home?'),
('c_0280', 'work',         FALSE, 'What is the word for ''to work''?'),
('c_0281', 'play',         TRUE,  'What is the word for ''to play'' — as children play?'),
('c_0282', 'cry',          FALSE, 'What is the word for ''to cry'' when you are sad?'),
('c_0283', 'want',         FALSE, 'What is the word for ''to want'' or need something?'),
('c_0284', 'help',         FALSE, 'What is the word for ''to help'' someone?'),
('c_0285', 'ask',          FALSE, 'What is the word for ''to ask'' a question?'),
('c_0286', 'answer',       FALSE, 'What is the word for ''to answer'' or respond to someone?'),
('c_0287', 'find',         FALSE, 'What is the word for ''to find'' something?'),
('c_0288', 'teach',        FALSE, 'What is the word for ''to teach'' someone?'),

-- ── Greetings & communication ─────────────────────────────────────────────────
('c_0289', 'greeting',     FALSE, 'What is the general greeting word in Dinka — the word you use when you meet someone?'),
('c_0290', 'goodbye',      FALSE, 'What is the word for ''goodbye'' — said when you are leaving?'),
('c_0291', 'thank you',    FALSE, 'What is the word for ''thank you''?'),
('c_0292', 'sorry',        FALSE, 'What is the word for ''sorry'' — when you apologise?'),
('c_0293', 'please',       FALSE, 'What is the word for ''please'' — used when making a polite request?'),

-- ── Direction & space ─────────────────────────────────────────────────────────
('c_0294', 'left',         TRUE,  'What is the word for ''left'' — the direction on your left side?'),
('c_0295', 'right',        TRUE,  'What is the word for ''right'' — the direction on your right side?'),
('c_0296', 'up',           FALSE, 'What is the word for ''up'' or ''above''?'),
('c_0297', 'down',         FALSE, 'What is the word for ''down'' or ''below''?'),
('c_0298', 'inside',       FALSE, 'What is the word for ''inside'' — within something?'),
('c_0299', 'outside',      FALSE, 'What is the word for ''outside'' — beyond the walls?'),

-- ── Spiritual & cultural ──────────────────────────────────────────────────────
('c_0300', 'God',          FALSE, 'What is the Dinka word for God — the highest divine being?');
