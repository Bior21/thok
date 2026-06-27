-- =============================================================================
-- Add ~62 everyday words identified as missing from the core vocabulary
--
-- These fill the gaps between the Dinka-focused word list (c_0001–c_0300) and
-- what a language learner needs from day one. Organised by category.
-- =============================================================================

INSERT INTO concepts (id, english_gloss, swadesh_list, prompt_context) VALUES

-- ── Core verbs ────────────────────────────────────────────────────────────────
-- These are among the most commonly used verbs in any language.
('c_0301', 'go',          FALSE, 'What is the word for ''to go'' — to travel or move towards a place?'),
('c_0302', 'have',        FALSE, 'What is the word for ''to have'' or own something?'),
('c_0303', 'do',          FALSE, 'What is the word for ''to do'' something?'),
('c_0304', 'make',        FALSE, 'What is the word for ''to make'' or create something?'),
('c_0305', 'understand',  FALSE, 'What is the word for ''to understand'' something?'),
('c_0306', 'like',        FALSE, 'What is the word for ''to like'' something or someone?'),
('c_0307', 'love',        FALSE, 'What is the word for ''to love'' someone?'),
('c_0308', 'read',        FALSE, 'What is the word for ''to read'' a book or text?'),
('c_0309', 'write',       FALSE, 'What is the word for ''to write''?'),
('c_0310', 'open',        FALSE, 'What is the word for ''to open'' something — like a door?'),
('c_0311', 'close',       FALSE, 'What is the word for ''to close'' or shut something?'),
('c_0312', 'start',       FALSE, 'What is the word for ''to start'' or begin something?'),
('c_0313', 'stop',        FALSE, 'What is the word for ''to stop'' doing something?'),
('c_0314', 'pay',         FALSE, 'What is the word for ''to pay'' for something?'),
('c_0315', 'wait',        FALSE, 'What is the word for ''to wait''?'),
('c_0316', 'tell',        FALSE, 'What is the word for ''to tell'' someone something?'),
('c_0317', 'use',         FALSE, 'What is the word for ''to use'' something?'),
('c_0318', 'get',         FALSE, 'What is the word for ''to get'' or obtain something?'),
('c_0319', 'take',        FALSE, 'What is the word for ''to take'' something?'),
('c_0320', 'be',          FALSE, 'What is the word for ''to be'' — as in ''I am a person'' or ''the water is cold''?'),

-- ── Question words ────────────────────────────────────────────────────────────
('c_0321', 'why',         TRUE,  'What is the word for ''why'' — used to ask the reason for something?'),
('c_0322', 'which',       TRUE,  'What is the word for ''which'' — used to choose between things?'),

-- ── Time ─────────────────────────────────────────────────────────────────────
('c_0323', 'afternoon',   FALSE, 'What is the word for afternoon — the time between midday and evening?'),
('c_0324', 'week',        FALSE, 'What is the word for a week — a period of seven days?'),
('c_0325', 'hour',        FALSE, 'What is the word for an hour — sixty minutes?'),
('c_0326', 'minute',      FALSE, 'What is the word for a minute — sixty seconds?'),

-- ── Days of the week ──────────────────────────────────────────────────────────
-- These may be loanwords in Dinka — worth documenting what speakers actually say.
('c_0327', 'Monday',      FALSE, 'What is the word for Monday — the first day of the work week?'),
('c_0328', 'Tuesday',     FALSE, 'What is the word for Tuesday?'),
('c_0329', 'Wednesday',   FALSE, 'What is the word for Wednesday?'),
('c_0330', 'Thursday',    FALSE, 'What is the word for Thursday?'),
('c_0331', 'Friday',      FALSE, 'What is the word for Friday?'),
('c_0332', 'Saturday',    FALSE, 'What is the word for Saturday?'),
('c_0333', 'Sunday',      FALSE, 'What is the word for Sunday?'),

-- ── Places ────────────────────────────────────────────────────────────────────
('c_0334', 'school',      FALSE, 'What is the word for a school — a place where children go to learn?'),
('c_0335', 'hospital',    FALSE, 'What is the word for a hospital — a place where sick people are treated?'),
('c_0336', 'bathroom',    FALSE, 'What is the word for a bathroom or toilet?'),
('c_0337', 'street',      FALSE, 'What is the word for a street or road in a town?'),

-- ── Transport ─────────────────────────────────────────────────────────────────
-- These may be loanwords — documenting the actual words speakers use is valuable.
('c_0338', 'car',         FALSE, 'What is the word for a car?'),
('c_0339', 'bus',         FALSE, 'What is the word for a bus — a large vehicle carrying many passengers?'),
('c_0340', 'bicycle',     FALSE, 'What is the word for a bicycle?'),
('c_0341', 'ticket',      FALSE, 'What is the word for a ticket — a paper that lets you travel or enter somewhere?'),

-- ── Money ─────────────────────────────────────────────────────────────────────
('c_0342', 'money',       FALSE, 'What is the word for money?'),
('c_0343', 'price',       FALSE, 'What is the word for the price of something — how much it costs?'),

-- ── Home objects ──────────────────────────────────────────────────────────────
('c_0344', 'door',        FALSE, 'What is the word for a door?'),
('c_0345', 'window',      FALSE, 'What is the word for a window?'),
('c_0346', 'bed',         FALSE, 'What is the word for a bed — the place where you sleep?'),
('c_0347', 'chair',       FALSE, 'What is the word for a chair — something you sit on?'),
('c_0348', 'table',       FALSE, 'What is the word for a table?'),
('c_0349', 'key',         FALSE, 'What is the word for a key — used to open a lock?'),

-- ── People ────────────────────────────────────────────────────────────────────
('c_0350', 'doctor',      FALSE, 'What is the word for a doctor — a person who treats sick people?'),
('c_0351', 'teacher',     FALSE, 'What is the word for a teacher — a person who teaches in school?'),
('c_0352', 'student',     FALSE, 'What is the word for a student — a person who is learning in school?'),
('c_0353', 'police',      FALSE, 'What is the word for a police officer?'),
('c_0354', 'neighbor',    FALSE, 'What is the word for a neighbor — someone who lives near you?'),

-- ── Food & drink ─────────────────────────────────────────────────────────────
('c_0355', 'rice',        FALSE, 'What is the word for rice?'),
('c_0356', 'bread',       FALSE, 'What is the word for bread?'),
('c_0357', 'tea',         FALSE, 'What is the word for tea — the hot drink?'),

-- ── Describing things ─────────────────────────────────────────────────────────
('c_0358', 'clean',       FALSE, 'What is the word for something that is clean — not dirty?'),
('c_0359', 'empty',       FALSE, 'What is the word for something that is empty — not full?'),
('c_0360', 'easy',        FALSE, 'What is the word for something that is easy — not difficult?'),
('c_0361', 'difficult',   FALSE, 'What is the word for something that is difficult or hard?'),

-- ── Health ────────────────────────────────────────────────────────────────────
('c_0362', 'pain',        FALSE, 'What is the word for pain — the feeling of hurting somewhere in your body?'),
('c_0363', 'medicine',    FALSE, 'What is the word for medicine — a substance used to treat sickness?'),

-- ── Communication & modern life ───────────────────────────────────────────────
('c_0364', 'phone',       FALSE, 'What is the word for a phone or mobile phone?')

ON CONFLICT (id) DO NOTHING;
