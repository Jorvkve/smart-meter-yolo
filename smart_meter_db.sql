-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 27, 2026 at 07:50 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `smart_meter_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `device_heartbeats`
--

CREATE TABLE `device_heartbeats` (
  `id` int(11) NOT NULL,
  `device_id` varchar(80) NOT NULL,
  `house_id` int(11) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `uptime_ms` bigint(20) DEFAULT NULL,
  `free_heap` int(11) DEFAULT NULL,
  `wifi_rssi` int(11) DEFAULT NULL,
  `status_message` varchar(80) DEFAULT NULL,
  `last_seen` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `device_heartbeats`
--

INSERT INTO `device_heartbeats` (`id`, `device_id`, `house_id`, `ip_address`, `uptime_ms`, `free_heap`, `wifi_rssi`, `status_message`, `last_seen`, `created_at`) VALUES
(1, 'test-pc', 14, '::1', 12345, 999, -40, 'manual_test', '2026-05-23 22:31:30', '2026-05-23 15:31:30'),
(2, 'esp32cam-house-14', 14, '192.168.1.156', 4639981, 172372, -48, 'alive', '2026-05-24 03:53:10', '2026-05-23 18:30:39');

-- --------------------------------------------------------

--
-- Table structure for table `electric_bills`
--

CREATE TABLE `electric_bills` (
  `id` int(11) NOT NULL,
  `bill_no` varchar(80) NOT NULL,
  `house_id` int(11) NOT NULL,
  `start_month` char(7) NOT NULL,
  `end_month` char(7) NOT NULL,
  `start_reading` float NOT NULL,
  `end_reading` float NOT NULL,
  `usage_unit` float NOT NULL,
  `unit_rate` decimal(12,4) NOT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `start_reading_time` datetime DEFAULT NULL,
  `end_reading_time` datetime DEFAULT NULL,
  `issue_date` datetime NOT NULL,
  `due_date` datetime NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `cancelled_at` datetime DEFAULT NULL,
  `cancel_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `electric_bills`
--

INSERT INTO `electric_bills` (`id`, `bill_no`, `house_id`, `start_month`, `end_month`, `start_reading`, `end_reading`, `usage_unit`, `unit_rate`, `total_amount`, `start_reading_time`, `end_reading_time`, `issue_date`, `due_date`, `status`, `cancelled_at`, `cancel_reason`, `created_at`) VALUES
(17, 'SM-20260527123505-H1-202603-202604', 1, '2026-03', '2026-04', 15664, 15672, 8, 3.2484, 25.99, '2026-03-15 12:05:00', '2026-04-15 12:10:00', '2026-05-27 05:35:05', '2026-06-03 05:35:05', 'active', NULL, NULL, '2026-05-27 05:35:05'),
(18, 'SM-20260527123535-H1-202603-202604', 1, '2026-03', '2026-04', 15664, 15672, 8, 3.2484, 25.99, '2026-03-15 12:05:00', '2026-04-15 12:10:00', '2026-05-27 05:35:35', '2026-06-03 05:35:35', 'active', NULL, NULL, '2026-05-27 05:35:35');

-- --------------------------------------------------------

--
-- Table structure for table `houses`
--

CREATE TABLE `houses` (
  `id` int(11) NOT NULL,
  `house_name` varchar(100) NOT NULL,
  `owner_name` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

--
-- Dumping data for table `houses`
--

INSERT INTO `houses` (`id`, `house_name`, `owner_name`, `address`, `phone`, `is_active`) VALUES
(1, 'บ้านหลังที่ 1', 'สมชาย', 'อยุธยา', '123456789', 1),
(2, 'บ้านหลังที่ 2', 'วิตรี', 'สระบุรี', '123456789', 1),
(3, 'บ้านหลังที่ 3', 'สมคิต', 'กรุงเทพ', '123456789', 1),
(4, 'CPE', 'RSU', 'รังสิต', '123456789', 1),
(14, 'TEST2', 'TEST', '', '', 1);

-- --------------------------------------------------------

--
-- Table structure for table `meter_readings`
--

CREATE TABLE `meter_readings` (
  `id` int(11) NOT NULL,
  `house_id` int(11) NOT NULL,
  `reading_value` float DEFAULT NULL,
  `image_filename` varchar(255) DEFAULT NULL,
  `reading_time` timestamp NULL DEFAULT current_timestamp(),
  `capture_mode` varchar(20) DEFAULT 'single',
  `selected_frame` int(11) DEFAULT NULL,
  `selection_reason` varchar(80) DEFAULT NULL,
  `avg_conf` float DEFAULT NULL,
  `frames_summary` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`frames_summary`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

--
-- Dumping data for table `meter_readings`
--

INSERT INTO `meter_readings` (`id`, `house_id`, `reading_value`, `image_filename`, `reading_time`, `capture_mode`, `selected_frame`, `selection_reason`, `avg_conf`, `frames_summary`) VALUES
(1, 1, 15664, 'esp32_house1_20260512_174528.jpg', '2026-03-15 05:05:00', 'single', NULL, NULL, NULL, NULL),
(2, 2, 9116, 'esp32_house2_20260512_175209.jpg', '2026-03-15 05:06:00', 'single', NULL, NULL, NULL, NULL),
(3, 3, 14581, 'esp32_house3_20260512_175234.jpg', '2026-03-15 05:07:00', 'single', NULL, NULL, NULL, NULL),
(5, 1, 15672, 'esp32_house1_20260513_235152.jpg', '2026-04-15 05:10:00', 'single', NULL, NULL, NULL, NULL),
(6, 2, 9126, 'esp32_house2_20260513_235156.jpg', '2026-04-15 05:11:00', 'single', NULL, NULL, NULL, NULL),
(7, 3, 14582, 'esp32_house3_20260513_235158.jpg', '2026-04-15 05:13:00', 'single', NULL, NULL, NULL, NULL),
(26, 1, 15090, 'meter_1778748967952.jpg', '2026-02-12 08:56:15', 'single', NULL, NULL, NULL, NULL),
(30, 1, 15684, 'meter_1778781718497.jpg', '2026-05-15 05:12:00', 'single', NULL, NULL, NULL, NULL),
(31, 2, 9130, 'meter_1778781769227.jpg', '2026-05-15 05:16:00', 'single', NULL, NULL, NULL, NULL),
(32, 3, 14583, 'meter_1778781801726.jpg', '2026-05-15 05:18:00', 'single', NULL, NULL, NULL, NULL),
(41, 1, 15703, 'meter_1779453856855_730449249.JPEG', '2026-05-16 13:41:45', 'single', NULL, NULL, NULL, NULL),
(42, 1, 15708, 'meter_1779453916748_725101428.JPEG', '2026-05-17 17:02:22', 'single', NULL, NULL, NULL, NULL),
(43, 1, 15709, 'meter_1779453935020_612715080.JPEG', '2026-05-19 16:12:40', 'single', NULL, NULL, NULL, NULL),
(44, 1, 15710, 'meter_1779453948157_847612857.JPEG', '2026-05-21 17:59:54', 'single', NULL, NULL, NULL, NULL),
(46, 3, 14591, 'meter_1779454037140_226218885.JPEG', '2026-05-16 13:41:22', 'single', NULL, NULL, NULL, NULL),
(47, 3, 14597, 'meter_1779454051513_309163107.JPEG', '2026-05-17 17:02:37', 'single', NULL, NULL, NULL, NULL),
(49, 3, 14613, 'meter_1779454080586_280631624.JPEG', '2026-05-21 17:59:06', 'single', NULL, NULL, NULL, NULL),
(50, 2, 9151, 'meter_1779454102037_761121421.JPEG', '2026-05-16 13:41:28', 'single', NULL, NULL, NULL, NULL),
(51, 2, 9161, 'meter_1779454113079_380907046.JPEG', '2026-05-17 17:02:38', 'single', NULL, NULL, NULL, NULL),
(52, 2, 9184, 'meter_1779454127298_22777516.JPEG', '2026-05-19 16:12:53', 'single', NULL, NULL, NULL, NULL),
(53, 2, 9200, 'meter_1779454140849_529083000.JPEG', '2026-05-21 17:59:06', 'single', NULL, NULL, NULL, NULL),
(54, 3, 14607, 'meter_1779455342551_821266569.JPEG', '2026-05-19 16:12:09', 'single', NULL, NULL, NULL, NULL),
(55, 1, 16000, NULL, '2026-05-22 21:13:42', 'single', NULL, NULL, NULL, NULL),
(56, 1, 16100, NULL, '2026-05-22 21:13:50', 'single', NULL, NULL, NULL, NULL),
(57, 1, 16200, NULL, '2026-05-22 21:13:59', 'single', NULL, NULL, NULL, NULL),
(63, 14, 4608, 'meter_1779564792438_483524466.jpg', '2026-05-23 19:33:25', 'burst', 1, 'close_transition_choose_highest', 0.535231, '[{\"index\":0,\"filename\":\"meter_1779564792362_111035079.jpg\",\"reading_value\":4608,\"boxes\":4,\"avg_conf\":0.519072599709034,\"selected\":false,\"prediction_error\":null},{\"index\":1,\"filename\":\"meter_1779564792438_483524466.jpg\",\"reading_value\":4608,\"boxes\":4,\"avg_conf\":0.535231277346611,\"selected\":true,\"prediction_error\":null},{\"index\":2,\"filename\":\"meter_1779564792508_787004314.jpg\",\"reading_value\":4606,\"boxes\":4,\"avg_conf\":0.5547829419374466,\"selected\":false,\"prediction_error\":null},{\"index\":3,\"filename\":\"meter_1779564792594_520770218.jpg\",\"reading_value\":4606,\"boxes\":4,\"avg_conf\":0.5682410076260567,\"selected\":false,\"prediction_error\":null},{\"index\":4,\"filename\":\"meter_1779564792690_840915514.jpg\",\"reading_value\":4606,\"boxes\":4,\"avg_conf\":0.6202618777751923,\"selected\":false,\"prediction_error\":null}]'),
(64, 14, 11606, 'meter_1779568683148_317462613.jpg', '2026-05-23 20:38:09', 'burst', 3, 'close_transition_choose_highest', 0.793567, '[{\"index\":0,\"filename\":\"meter_1779568682916_351089006.jpg\",\"reading_value\":11605,\"boxes\":5,\"avg_conf\":0.7987988114356994,\"selected\":false,\"prediction_error\":null},{\"index\":1,\"filename\":\"meter_1779568683000_609946140.jpg\",\"reading_value\":11605,\"boxes\":5,\"avg_conf\":0.7992152094841003,\"selected\":false,\"prediction_error\":null},{\"index\":2,\"filename\":\"meter_1779568683073_655007766.jpg\",\"reading_value\":11606,\"boxes\":5,\"avg_conf\":0.7786164283752441,\"selected\":false,\"prediction_error\":null},{\"index\":3,\"filename\":\"meter_1779568683148_317462613.jpg\",\"reading_value\":11606,\"boxes\":5,\"avg_conf\":0.7935668706893921,\"selected\":true,\"prediction_error\":null},{\"index\":4,\"filename\":\"meter_1779568683227_32094120.jpg\",\"reading_value\":11604,\"boxes\":5,\"avg_conf\":0.7958571910858154,\"selected\":false,\"prediction_error\":null}]'),
(65, 4, 11709, NULL, '2026-05-25 08:44:00', 'single', NULL, NULL, NULL, NULL),
(66, 4, 11711, NULL, '2026-05-25 11:00:00', 'single', NULL, NULL, NULL, NULL),
(67, 4, 11713, NULL, '2026-05-25 14:37:00', 'single', NULL, NULL, NULL, NULL),
(68, 4, 11713, NULL, '2026-05-25 17:38:00', 'single', NULL, NULL, NULL, NULL),
(69, 4, 11718, NULL, '2026-05-26 07:50:00', 'single', NULL, NULL, NULL, NULL),
(70, 4, 11719, NULL, '2026-05-26 10:11:00', 'single', NULL, NULL, NULL, NULL),
(71, 4, 11721, NULL, '2026-05-26 13:48:00', 'single', NULL, NULL, NULL, NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `device_heartbeats`
--
ALTER TABLE `device_heartbeats`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `device_id` (`device_id`),
  ADD KEY `house_id` (`house_id`),
  ADD KEY `last_seen` (`last_seen`);

--
-- Indexes for table `electric_bills`
--
ALTER TABLE `electric_bills`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `bill_no` (`bill_no`),
  ADD KEY `house_id` (`house_id`);

--
-- Indexes for table `houses`
--
ALTER TABLE `houses`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `meter_readings`
--
ALTER TABLE `meter_readings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `house_id` (`house_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `device_heartbeats`
--
ALTER TABLE `device_heartbeats`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=37;

--
-- AUTO_INCREMENT for table `electric_bills`
--
ALTER TABLE `electric_bills`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `houses`
--
ALTER TABLE `houses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `meter_readings`
--
ALTER TABLE `meter_readings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=72;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `electric_bills`
--
ALTER TABLE `electric_bills`
  ADD CONSTRAINT `electric_bills_ibfk_1` FOREIGN KEY (`house_id`) REFERENCES `houses` (`id`);

--
-- Constraints for table `meter_readings`
--
ALTER TABLE `meter_readings`
  ADD CONSTRAINT `meter_readings_ibfk_1` FOREIGN KEY (`house_id`) REFERENCES `houses` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
