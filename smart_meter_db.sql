-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 15, 2026 at 12:42 PM
-- Server version: 11.7.2-MariaDB
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
-- Table structure for table `houses`
--

CREATE TABLE `houses` (
  `id` int(11) NOT NULL,
  `house_name` varchar(100) NOT NULL,
  `owner_name` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

--
-- Dumping data for table `houses`
--

INSERT INTO `houses` (`id`, `house_name`, `owner_name`, `address`, `phone`, `is_active`) VALUES
(1, 'บ้านหลังที่ 1', 'สมชาย', 'อยุธยา', '123456789', 1),
(2, 'บ้านหลังที่ 2', 'วิตรี', 'สระบุรี', '123456789', 1),
(3, 'บ้านหลังที่ 3', 'สมคิต', 'กรุงเทพ', '123456789', 1);

-- --------------------------------------------------------

--
-- Table structure for table `meter_readings`
--

CREATE TABLE `meter_readings` (
  `id` int(11) NOT NULL,
  `house_id` int(11) NOT NULL,
  `reading_value` float DEFAULT NULL,
  `image_filename` varchar(255) DEFAULT NULL,
  `reading_time` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

--
-- Dumping data for table `meter_readings`
--

INSERT INTO `meter_readings` (`id`, `house_id`, `reading_value`, `image_filename`, `reading_time`) VALUES
(36, 2, 34736, 'image-1765398855496-439422598.jpg', '2026-03-01 20:34:16'),
(50, 3, 9298, 'image-1772047554768-834969348.jpg', '2026-03-02 19:25:55'),
(51, 1, 9298, 'image-1772262741302-260265207.jpg', '2026-03-01 07:12:22'),
(54, 1, 1500, 'demo1.jpg', '2026-01-01 01:00:00'),
(55, 1, 1700, 'demo1.jpg', '2026-01-15 01:00:00'),
(56, 1, 2000, 'demo1.jpg', '2026-02-01 01:00:00'),
(57, 1, 2300, 'demo1.jpg', '2026-02-20 01:00:00'),
(58, 1, 2600, 'demo1.jpg', '2026-03-01 01:00:00'),
(59, 2, 5000, 'demo2.jpg', '2025-12-03 02:00:00'),
(60, 2, 5200, 'demo2.jpg', '2025-12-20 02:00:00'),
(61, 2, 5600, 'demo2.jpg', '2026-01-05 02:00:00'),
(62, 2, 6000, 'demo2.jpg', '2026-01-25 02:00:00'),
(63, 2, 6500, 'demo2.jpg', '2026-02-10 02:00:00'),
(64, 2, 7100, 'demo2.jpg', '2026-02-28 02:00:00'),
(66, 3, 9000, 'demo3.jpg', '2025-12-02 03:00:00'),
(68, 3, 10000, 'demo3.jpg', '2026-01-03 03:00:00'),
(69, 3, 10800, 'demo3.jpg', '2026-01-22 03:00:00'),
(70, 3, 12000, 'demo3.jpg', '2026-02-08 03:00:00'),
(71, 3, 13500, 'demo3.jpg', '2026-02-26 03:00:00'),
(72, 3, 15000, 'demo3.jpg', '2026-03-03 03:00:00');

--
-- Indexes for dumped tables
--

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
-- AUTO_INCREMENT for table `houses`
--
ALTER TABLE `houses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `meter_readings`
--
ALTER TABLE `meter_readings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=73;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `meter_readings`
--
ALTER TABLE `meter_readings`
  ADD CONSTRAINT `meter_readings_ibfk_1` FOREIGN KEY (`house_id`) REFERENCES `houses` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
