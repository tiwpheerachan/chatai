-- =============================================================
-- OmniChat AI — Seed data (run after schema + RLS)
-- =============================================================
-- หมายเหตุ: profiles ต้อง insert หลัง create user ใน Supabase Auth
-- ใช้ scripts/seed.ts สำหรับ seed user เพราะต้องผ่าน supabase-admin

-- ===== BRANDS =====
insert into brands (id, name, slug, color) values
  ('11111111-1111-1111-1111-111111111111', 'GlowSkin', 'glowskin', '#ec4899'),
  ('22222222-2222-2222-2222-222222222222', 'TechZone', 'techzone', '#3b82f6'),
  ('33333333-3333-3333-3333-333333333333', 'HomeChef', 'homechef', '#f59e0b')
on conflict (id) do nothing;

-- ===== KNOWLEDGE BASE =====
insert into knowledge_base (brand_id, title, content, tags) values
  (null, 'นโยบายการคืนสินค้า 30 วัน',
   'ลูกค้าสามารถคืนสินค้าได้ภายใน 30 วันหลังได้รับสินค้า โดยสินค้าต้องอยู่ในสภาพสมบูรณ์ มีบรรจุภัณฑ์ครบถ้วน ค่าจัดส่งคืนผู้ขายเป็นผู้รับผิดชอบหากเป็นความผิดพลาดของร้าน หากเป็นการเปลี่ยนใจลูกค้าเป็นผู้รับผิดชอบ',
   array['คืนสินค้า','refund']),
  (null, 'ระยะเวลาจัดส่ง',
   'กรุงเทพและปริมณฑล 1-2 วันทำการ ต่างจังหวัด 2-4 วันทำการ EMS +1 วัน เก็บปลายทาง COD รองรับทุกพื้นที่',
   array['จัดส่ง','shipping']),
  ('11111111-1111-1111-1111-111111111111', 'GlowSkin Vitamin C Serum 30ml',
   'เซรั่มวิตามินซี 20% เข้มข้น เหมาะกับผิวหมองคล้ำ ใช้เช้า-เย็นหลังล้างหน้า ขนาด 30ml ราคา 890 บาท เก็บในที่เย็น ไม่โดนแดด อายุ 24 เดือน สำหรับผู้ที่ตั้งครรภ์ปรึกษาแพทย์ก่อนใช้',
   array['สินค้า','serum']),
  ('11111111-1111-1111-1111-111111111111', 'GlowSkin Sunscreen SPF50+ PA++++',
   'กันแดดสูตรน้ำ ซึมไว ไม่เหนียวเหนอะหนะ SPF50+ PA++++ ป้องกัน UVA UVB ผสม Niacinamide ขนาด 50ml ราคา 590 บาท',
   array['สินค้า','กันแดด']),
  ('22222222-2222-2222-2222-222222222222', 'TechZone Wireless Earbuds Pro',
   'หูฟังไร้สาย ANC ลดเสียง 35dB แบตเตอรี่ 8 ชม + 24 ชม. เคส กันน้ำ IPX5 Bluetooth 5.3 รับประกัน 1 ปี ราคา 1,990 บาท',
   array['สินค้า','หูฟัง']),
  ('22222222-2222-2222-2222-222222222222', 'TechZone Power Bank 20000mAh',
   'พาวเวอร์แบงค์ 20000mAh ชาร์จเร็ว PD 22.5W รองรับ USB-C in/out 3 ช่อง น้ำหนัก 380g ราคา 890 บาท',
   array['สินค้า','powerbank']),
  ('33333333-3333-3333-3333-333333333333', 'HomeChef หม้อทอดไร้น้ำมัน 5L',
   'หม้อทอดไร้น้ำมัน 5 ลิตร กำลังไฟ 1500W จอ digital touchscreen 8 เมนู preset รับประกัน 2 ปี ราคา 2,290 บาท',
   array['สินค้า','หม้อทอด']),
  (null, 'วิธีชำระเงิน',
   'รับบัตรเครดิต/เดบิต, โอนผ่านธนาคาร (SCB / KBank / Krungthai), PromptPay, TrueMoney, ShopeePay, COD',
   array['ชำระเงิน']),
  (null, 'โปรโมชั่นเดือนนี้',
   'ลด 15% เมื่อซื้อครบ 1,500 บาท ใส่โค้ด SAVE15 / ส่งฟรีเมื่อซื้อครบ 999 บาท / สมาชิกใหม่รับโค้ดส่วนลด 100 บาท',
   array['โปร','sale']);

-- ===== MACROS =====
insert into macros (title, shortcut, text) values
  ('ทักทาย', '/hi', 'สวัสดีค่ะ ขอบคุณที่ติดต่อมานะคะ มีอะไรให้ช่วยดูแลคะ? 😊'),
  ('ขออภัยล่าช้า', '/sorry', 'ขออภัยที่ตอบล่าช้าค่ะ ทางทีมกำลังตรวจสอบให้ คุณ {{name}} ค่ะ'),
  ('ขอเลขออเดอร์', '/order', 'รบกวนขอเลขออเดอร์ของคุณลูกค้าด้วยนะคะ จะได้ตรวจสอบให้ค่ะ'),
  ('ปิดเคส', '/close', 'หากไม่มีอะไรเพิ่มเติม ขอจบการสนทนานะคะ ขอบคุณที่ใช้บริการ 💖'),
  ('แจ้งเลขพัสดุ', '/tracking', 'พัสดุของคุณ {{name}} เลขที่ {{tracking}} ส่งโดย {{courier}} ค่ะ'),
  ('โปรโมชั่น', '/promo', 'เดือนนี้มีโปร: ใส่โค้ด SAVE15 ลด 15% เมื่อซื้อครบ 1,500 บาท ค่ะ 🎁');

-- ===== BOT RULES =====
insert into bot_rules (pattern, intent, response_template, action, priority) values
  ('^(สวัสดี|hi|hello|หวัด)', 'greeting',
   'สวัสดีค่ะ คุณ {{name}} ยินดีให้บริการนะคะ มีอะไรให้ Aria ช่วยดูแลคะ? 😊', 'reply', 90),
  ('(โกรธ|แย่|ห่วย|fuck|ห่า)', 'angry',
   'ขออภัยในความไม่สะดวกค่ะ ขอโอนให้หัวหน้าช่วยดูแลทันทีนะคะ 🙏', 'handoff', 100),
  ('(ขอบคุณ|thank|thx)', 'thanks',
   'ยินดีค่ะ หากมีอะไรเพิ่มเติมแจ้งได้เลยนะคะ 💖', 'reply', 80);

-- ===== CHANNELS =====
insert into channels (brand_id, type, name, status, webhook_url) values
  ('11111111-1111-1111-1111-111111111111', 'line', 'GlowSkin Official', 'connected', '/api/webhooks/line'),
  ('11111111-1111-1111-1111-111111111111', 'facebook', 'GlowSkin Beauty', 'connected', '/api/webhooks/meta'),
  ('11111111-1111-1111-1111-111111111111', 'instagram', '@glowskin.official', 'connected', '/api/webhooks/meta'),
  ('11111111-1111-1111-1111-111111111111', 'shopee', 'GlowSkin Mall', 'connected', '/api/webhooks/shopee'),
  ('11111111-1111-1111-1111-111111111111', 'tiktok', 'GlowSkin Shop', 'connected', '/api/webhooks/tiktok'),
  ('11111111-1111-1111-1111-111111111111', 'whatsapp', 'GlowSkin WA', 'connected', '/api/webhooks/whatsapp'),
  ('11111111-1111-1111-1111-111111111111', 'web', 'glowskin.com', 'connected', '/api/webhooks/web'),
  ('11111111-1111-1111-1111-111111111111', 'lazada', 'GlowSkin LazMall', 'pending', null);
