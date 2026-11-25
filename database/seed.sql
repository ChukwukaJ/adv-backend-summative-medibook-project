-- Sample data. Run after schema.sql on empty tables:  mysql -u root -p < database/seed.sql
-- Dates are relative to the day the script runs, so the demo data is always "upcoming".

USE medibook;

INSERT INTO patients (full_name, email, phone) VALUES
  ('Ama Mensah',   'ama@mail.com',   '0244-111-222'),
  ('Kojo Owusu',   'kojo@mail.com',  '0555-333-444'),
  ('Efua Quaye',   'efua@mail.com',  '0200-555-666'),
  ('Yaw Darko',    'yaw@mail.com',   '0277-777-888'),
  ('Abena Sarpong','abena@mail.com', '0244-999-000'),
  ('Kwame Asante', 'kwame@mail.com', '0501-234-567');

INSERT INTO doctors (full_name, specialty, consultation_fee, room) VALUES
  ('Dr. Boateng', 'Dermatology', 150.00, 'R-12'),
  ('Dr. Adjei',   'Paediatrics', 100.00, 'R-03'),
  ('Dr. Osei',    'Cardiology',  220.00, 'R-07'),
  ('Dr. Amoah',   'General Practice', 80.00, 'R-01');  -- no appointments on purpose

SET @d_past_20 = DATE_SUB(CURDATE(), INTERVAL 20 DAY);
SET @d_past_14 = DATE_SUB(CURDATE(), INTERVAL 14 DAY);
SET @d1 = DATE_ADD(CURDATE(), INTERVAL 1 DAY);
SET @d2 = DATE_ADD(CURDATE(), INTERVAL 2 DAY);
SET @d3 = DATE_ADD(CURDATE(), INTERVAL 3 DAY);
SET @d5 = DATE_ADD(CURDATE(), INTERVAL 5 DAY);

-- Past appointments (revenue history; the second one was discounted, as in the spreadsheet).
INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, amount_paid) VALUES
  (1, 1, TIMESTAMP(@d_past_20, '09:00:00'), 150.00),
  (2, 1, TIMESTAMP(@d_past_20, '09:30:00'), 120.00),
  (1, 2, TIMESTAMP(@d_past_14, '10:00:00'), 100.00);

-- A cancelled appointment with a full refund (record kept, slot free again).
INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, status, amount_paid, refund_amount, cancelled_at)
VALUES (3, 2, TIMESTAMP(@d5, '09:00:00'), 'cancelled', 100.00, 100.00, NOW());

-- Dr. Boateng is fully booked (12/12) three days from now: 09:00 - 14:30.
INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, amount_paid) VALUES
  (1, 1, TIMESTAMP(@d3, '09:00:00'), 150.00),
  (2, 1, TIMESTAMP(@d3, '09:30:00'), 150.00),
  (3, 1, TIMESTAMP(@d3, '10:00:00'), 150.00),
  (4, 1, TIMESTAMP(@d3, '10:30:00'), 150.00),
  (5, 1, TIMESTAMP(@d3, '11:00:00'), 150.00),
  (6, 1, TIMESTAMP(@d3, '11:30:00'), 150.00),
  (1, 1, TIMESTAMP(@d3, '12:00:00'), 150.00),
  (2, 1, TIMESTAMP(@d3, '12:30:00'), 150.00),
  (3, 1, TIMESTAMP(@d3, '13:00:00'), 150.00),
  (4, 1, TIMESTAMP(@d3, '13:30:00'), 150.00),
  (5, 1, TIMESTAMP(@d3, '14:00:00'), 150.00),
  (6, 1, TIMESTAMP(@d3, '14:30:00'), 150.00);

-- Dr. Osei is near the cap (10/12 = 83%) two days from now, so it shows in the busy-days report.
INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, amount_paid) VALUES
  (1, 3, TIMESTAMP(@d2, '09:00:00'), 220.00),
  (2, 3, TIMESTAMP(@d2, '09:30:00'), 220.00),
  (3, 3, TIMESTAMP(@d2, '10:00:00'), 220.00),
  (4, 3, TIMESTAMP(@d2, '10:30:00'), 220.00),
  (5, 3, TIMESTAMP(@d2, '11:00:00'), 220.00),
  (6, 3, TIMESTAMP(@d2, '11:30:00'), 220.00),
  (1, 3, TIMESTAMP(@d2, '13:00:00'), 220.00),
  (2, 3, TIMESTAMP(@d2, '13:30:00'), 220.00),
  (3, 3, TIMESTAMP(@d2, '14:00:00'), 220.00),
  (4, 3, TIMESTAMP(@d2, '14:30:00'), 220.00);

-- A couple of ordinary upcoming bookings.
INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, amount_paid) VALUES
  (5, 2, TIMESTAMP(@d1, '10:00:00'), 100.00),
  (6, 2, TIMESTAMP(@d1, '10:30:00'), 100.00);
