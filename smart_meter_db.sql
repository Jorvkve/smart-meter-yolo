-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 24, 2026 at 12:51 AM
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
  `unit_rate` decimal(10,2) NOT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `start_reading_time` datetime DEFAULT NULL,
  `end_reading_time` datetime DEFAULT NULL,
  `issue_date` datetime NOT NULL,
  `due_date` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `electric_bills`
--

INSERT INTO `electric_bills` (`id`, `bill_no`, `house_id`, `start_month`, `end_month`, `start_reading`, `end_reading`, `usage_unit`, `unit_rate`, `total_amount`, `start_reading_time`, `end_reading_time`, `issue_date`, `due_date`, `created_at`) VALUES
(4, 'SM-20260518010314-H1-202603-202604', 1, '2026-03', '2026-04', 15664, 15672, 8, 3.25, 25.99, '2026-03-12 10:45:28', '2026-04-12 16:51:52', '2026-05-18 18:03:14', '2026-05-25 18:03:14', '2026-05-18 18:03:14'),
(5, 'SM-20260518012025-H1-202604-202605', 1, '2026-04', '2026-05', 15672, 15684, 12, 3.25, 38.98, '2026-04-12 16:51:52', '2026-05-14 18:02:05', '2026-05-18 18:20:25', '2026-05-25 18:20:25', '2026-05-18 18:20:25'),
(7, 'SM-20260520120122-H2-202604-202605', 2, '2026-04', '2026-05', 9126, 9130, 4, 3.25, 12.99, '2026-04-12 23:51:56', '2026-05-15 01:02:56', '2026-05-20 05:01:22', '2026-05-27 05:01:22', '2026-05-20 05:01:22');

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
(1, 1, 15664, 'esp32_house1_20260512_174528.jpg', '2026-03-12 10:45:28', 'single', NULL, NULL, NULL, NULL),
(2, 2, 9116, 'esp32_house2_20260512_175209.jpg', '2026-03-12 10:52:09', 'single', NULL, NULL, NULL, NULL),
(3, 3, 14581, 'esp32_house3_20260512_175234.jpg', '2026-03-12 10:52:34', 'single', NULL, NULL, NULL, NULL),
(5, 1, 15672, 'esp32_house1_20260513_235152.jpg', '2026-04-12 16:51:52', 'single', NULL, NULL, NULL, NULL),
(6, 2, 9126, 'esp32_house2_20260513_235156.jpg', '2026-04-12 16:51:56', 'single', NULL, NULL, NULL, NULL),
(7, 3, 14582, 'esp32_house3_20260513_235158.jpg', '2026-04-12 16:51:58', 'single', NULL, NULL, NULL, NULL),
(26, 1, 15090, 'meter_1778748967952.jpg', '2026-02-12 08:56:15', 'single', NULL, NULL, NULL, NULL),
(30, 1, 15684, 'meter_1778781718497.jpg', '2026-05-14 18:02:05', 'single', NULL, NULL, NULL, NULL),
(31, 2, 9130, 'meter_1778781769227.jpg', '2026-05-14 18:02:56', 'single', NULL, NULL, NULL, NULL),
(32, 3, 14583, 'meter_1778781801726.jpg', '2026-05-14 18:03:28', 'single', NULL, NULL, NULL, NULL),
(34, 4, 12487, 'meter_1778785457271.jpg', '2026-05-14 19:04:24', 'single', NULL, NULL, NULL, NULL),
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
(58, 4, NULL, 'meter_1779539751620_326359688.jpg', '2026-05-23 12:36:20', 'burst', 0, 'no_valid_prediction', NULL, '[{\"index\":0,\"filename\":\"meter_1779539751620_326359688.jpg\",\"reading_value\":null,\"boxes\":0,\"avg_conf\":null,\"selected\":true,\"prediction_error\":null},{\"index\":1,\"filename\":\"meter_1779539751700_418072968.jpg\",\"reading_value\":null,\"boxes\":0,\"avg_conf\":null,\"selected\":false,\"prediction_error\":null},{\"index\":2,\"filename\":\"meter_1779539751773_184287917.jpg\",\"reading_value\":null,\"boxes\":0,\"avg_conf\":null,\"selected\":false,\"prediction_error\":null}]'),
(59, 4, 17081, 'meter_1779539872778_627185353.jpg', '2026-05-23 12:38:00', 'burst', 1, 'majority_confidence_median', 0.833756, '[{\"index\":0,\"filename\":\"meter_1779539872739_613283497.jpg\",\"reading_value\":1,\"boxes\":1,\"avg_conf\":0.35120517015457153,\"selected\":false,\"prediction_error\":null},{\"index\":1,\"filename\":\"meter_1779539872778_627185353.jpg\",\"reading_value\":17081,\"boxes\":5,\"avg_conf\":0.8337563753128052,\"selected\":true,\"prediction_error\":null},{\"index\":2,\"filename\":\"meter_1779539872850_687342474.jpg\",\"reading_value\":17091,\"boxes\":5,\"avg_conf\":0.8307983994483947,\"selected\":false,\"prediction_error\":null}]'),
(60, 4, 17881, 'meter_1779540705391_38352488.jpg', '2026-05-23 12:51:52', 'burst', 9, 'close_transition_choose_highest', 0.666661, '[{\"index\":0,\"filename\":\"meter_1779540704688_449434637.jpg\",\"reading_value\":null,\"boxes\":0,\"avg_conf\":null,\"selected\":false,\"prediction_error\":null},{\"index\":1,\"filename\":\"meter_1779540704805_523214437.jpg\",\"reading_value\":null,\"boxes\":0,\"avg_conf\":null,\"selected\":false,\"prediction_error\":null},{\"index\":2,\"filename\":\"meter_1779540704888_201397153.jpg\",\"reading_value\":null,\"boxes\":0,\"avg_conf\":null,\"selected\":false,\"prediction_error\":null},{\"index\":3,\"filename\":\"meter_1779540704987_143632599.jpg\",\"reading_value\":null,\"boxes\":0,\"avg_conf\":null,\"selected\":false,\"prediction_error\":null},{\"index\":4,\"filename\":\"meter_1779540705052_78814389.jpg\",\"reading_value\":14641,\"boxes\":5,\"avg_conf\":0.5679478287696839,\"selected\":false,\"prediction_error\":null},{\"index\":5,\"filename\":\"meter_1779540705110_694915951.jpg\",\"reading_value\":7891,\"boxes\":4,\"avg_conf\":0.5818059146404266,\"selected\":false,\"prediction_error\":null},{\"index\":6,\"filename\":\"meter_1779540705176_480531677.jpg\",\"reading_value\":16081,\"boxes\":5,\"avg_conf\":0.6223803639411927,\"selected\":false,\"prediction_error\":null},{\"index\":7,\"filename\":\"meter_1779540705228_777130133.jpg\",\"reading_value\":761,\"boxes\":3,\"avg_conf\":0.6064786314964294,\"selected\":false,\"prediction_error\":null},{\"index\":8,\"filename\":\"meter_1779540705303_202369875.jpg\",\"reading_value\":14001,\"boxes\":5,\"avg_conf\":0.5649205625057221,\"selected\":false,\"prediction_error\":null},{\"index\":9,\"filename\":\"meter_1779540705391_38352488.jpg\",\"reading_value\":17881,\"boxes\":5,\"avg_conf\":0.6666611433029175,\"selected\":true,\"prediction_error\":null}]'),
(61, 4, 17081, 'meter_1779540916552_148027371.jpg', '2026-05-23 12:55:24', 'burst', 1, 'majority_confidence_median', 0.858312, '[{\"index\":0,\"filename\":\"meter_1779540916509_730380118.jpg\",\"reading_value\":100,\"boxes\":3,\"avg_conf\":0.6557218233744303,\"selected\":false,\"prediction_error\":null},{\"index\":1,\"filename\":\"meter_1779540916552_148027371.jpg\",\"reading_value\":17081,\"boxes\":5,\"avg_conf\":0.858312439918518,\"selected\":true,\"prediction_error\":null},{\"index\":2,\"filename\":\"meter_1779540916592_659728076.jpg\",\"reading_value\":17081,\"boxes\":5,\"avg_conf\":0.8204265713691712,\"selected\":false,\"prediction_error\":null},{\"index\":3,\"filename\":\"meter_1779540916665_791835580.jpg\",\"reading_value\":17081,\"boxes\":5,\"avg_conf\":0.8212746500968933,\"selected\":false,\"prediction_error\":null},{\"index\":4,\"filename\":\"meter_1779540916730_153094324.jpg\",\"reading_value\":17081,\"boxes\":5,\"avg_conf\":0.8405208110809326,\"selected\":false,\"prediction_error\":null},{\"index\":5,\"filename\":\"meter_1779540916783_292010743.jpg\",\"reading_value\":17081,\"boxes\":5,\"avg_conf\":0.8087257385253906,\"selected\":false,\"prediction_error\":null},{\"index\":6,\"filename\":\"meter_1779540916862_165971551.jpg\",\"reading_value\":17001,\"boxes\":5,\"avg_conf\":0.8348283052444458,\"selected\":false,\"prediction_error\":null},{\"index\":7,\"filename\":\"meter_1779540916926_820670926.jpg\",\"reading_value\":17081,\"boxes\":5,\"avg_conf\":0.8496490359306336,\"selected\":false,\"prediction_error\":null},{\"index\":8,\"filename\":\"meter_1779540916975_46783680.jpg\",\"reading_value\":17081,\"boxes\":5,\"avg_conf\":0.8477347493171692,\"selected\":false,\"prediction_error\":null},{\"index\":9,\"filename\":\"meter_1779540917029_386474100.jpg\",\"reading_value\":null,\"boxes\":0,\"avg_conf\":null,\"selected\":false,\"prediction_error\":null}]'),
(63, 14, 4608, 'meter_1779564792438_483524466.jpg', '2026-05-23 19:33:25', 'burst', 1, 'close_transition_choose_highest', 0.535231, '[{\"index\":0,\"filename\":\"meter_1779564792362_111035079.jpg\",\"reading_value\":4608,\"boxes\":4,\"avg_conf\":0.519072599709034,\"selected\":false,\"prediction_error\":null},{\"index\":1,\"filename\":\"meter_1779564792438_483524466.jpg\",\"reading_value\":4608,\"boxes\":4,\"avg_conf\":0.535231277346611,\"selected\":true,\"prediction_error\":null},{\"index\":2,\"filename\":\"meter_1779564792508_787004314.jpg\",\"reading_value\":4606,\"boxes\":4,\"avg_conf\":0.5547829419374466,\"selected\":false,\"prediction_error\":null},{\"index\":3,\"filename\":\"meter_1779564792594_520770218.jpg\",\"reading_value\":4606,\"boxes\":4,\"avg_conf\":0.5682410076260567,\"selected\":false,\"prediction_error\":null},{\"index\":4,\"filename\":\"meter_1779564792690_840915514.jpg\",\"reading_value\":4606,\"boxes\":4,\"avg_conf\":0.6202618777751923,\"selected\":false,\"prediction_error\":null}]'),
(64, 14, 11606, 'meter_1779568683148_317462613.jpg', '2026-05-23 20:38:09', 'burst', 3, 'close_transition_choose_highest', 0.793567, '[{\"index\":0,\"filename\":\"meter_1779568682916_351089006.jpg\",\"reading_value\":11605,\"boxes\":5,\"avg_conf\":0.7987988114356994,\"selected\":false,\"prediction_error\":null},{\"index\":1,\"filename\":\"meter_1779568683000_609946140.jpg\",\"reading_value\":11605,\"boxes\":5,\"avg_conf\":0.7992152094841003,\"selected\":false,\"prediction_error\":null},{\"index\":2,\"filename\":\"meter_1779568683073_655007766.jpg\",\"reading_value\":11606,\"boxes\":5,\"avg_conf\":0.7786164283752441,\"selected\":false,\"prediction_error\":null},{\"index\":3,\"filename\":\"meter_1779568683148_317462613.jpg\",\"reading_value\":11606,\"boxes\":5,\"avg_conf\":0.7935668706893921,\"selected\":true,\"prediction_error\":null},{\"index\":4,\"filename\":\"meter_1779568683227_32094120.jpg\",\"reading_value\":11604,\"boxes\":5,\"avg_conf\":0.7958571910858154,\"selected\":false,\"prediction_error\":null}]');

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
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `houses`
--
ALTER TABLE `houses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `meter_readings`
--
ALTER TABLE `meter_readings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=65;

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
