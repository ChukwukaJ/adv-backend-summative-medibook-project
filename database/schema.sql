-- MediBook schema (3NF). Run on a fresh MySQL 8 server:  mysql -u root -p < database/schema.sql

CREATE DATABASE IF NOT EXISTS medibook
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE medibook;

CREATE TABLE IF NOT EXISTS patients (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  full_name   VARCHAR(100)  NOT NULL,
  email       VARCHAR(255)  NOT NULL,
  phone       VARCHAR(20)   NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT uq_patients_email UNIQUE (email)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS doctors (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  full_name        VARCHAR(100)  NOT NULL,
  specialty        VARCHAR(100)  NOT NULL,
  consultation_fee DECIMAL(10,2) NOT NULL,
  room             VARCHAR(20)   NOT NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_doctors_fee_non_negative CHECK (consultation_fee >= 0)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS appointments (
  id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  patient_id           INT UNSIGNED  NOT NULL,
  doctor_id            INT UNSIGNED  NOT NULL,
  appointment_datetime DATETIME      NOT NULL,
  status               ENUM('booked','cancelled') NOT NULL DEFAULT 'booked',
  amount_paid          DECIMAL(10,2) NOT NULL,
  refund_amount        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  booked_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at         DATETIME      NULL,
  -- Equals the slot while the appointment is booked and NULL once cancelled.
  -- MySQL treats NULLs as distinct in UNIQUE indexes, so cancelled rows never block the slot.
  active_slot          DATETIME GENERATED ALWAYS AS
                         (IF(status = 'booked', appointment_datetime, NULL)) STORED,
  PRIMARY KEY (id),
  CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- A doctor can never hold two active appointments at the same date/time.
  CONSTRAINT uq_doctor_active_slot UNIQUE (doctor_id, active_slot),
  INDEX idx_appointments_doctor_datetime (doctor_id, appointment_datetime),
  CONSTRAINT chk_appt_slot_boundary
    CHECK (MINUTE(appointment_datetime) IN (0, 30) AND SECOND(appointment_datetime) = 0),
  CONSTRAINT chk_appt_working_hours
    CHECK (TIME(appointment_datetime) BETWEEN '09:00:00' AND '16:30:00'),
  CONSTRAINT chk_appt_amount_paid CHECK (amount_paid >= 0),
  CONSTRAINT chk_appt_refund_range CHECK (refund_amount >= 0 AND refund_amount <= amount_paid),
  CONSTRAINT chk_appt_cancellation_state CHECK (
    (status = 'booked'    AND cancelled_at IS NULL AND refund_amount = 0)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL)
  )
) ENGINE = InnoDB;
