CREATE DATABASE IF NOT EXISTS sensor_data;

CREATE TABLE IF NOT EXISTS sensor_data.readings (
    device_id String,
    temperature Float32,
    humidity Float32,
    pressure Float32,
    wind_speed Float32,
    heat_index Float32,
    air_density Float32,
    wind_chill Float32,
    dew_point Float32,
    location String,
    recorded_at DateTime,
    anomaly_prob Float32,
    signature String,
    attestation String
) ENGINE = MergeTree()

ORDER BY recorded_at;

CREATE TABLE IF NOT EXISTS sensor_data.cities (
    location String,
    name String,
    country String,
    region String,
    latitude Float64,
    longitude Float64,
    population UInt32
) ENGINE = MergeTree()
ORDER BY location;

INSERT INTO sensor_data.cities
SELECT
    concat('Location_', toString(number + 1)) AS location,
    concat(
        arrayElement(['North','New','Port','San','Lake','Fort','Mount','East','West','Old','Great','Saint'], (number % 12) + 1),
        ' ',
        arrayElement(['Ash','Bridge','Clear','Elm','Glen','Haw','Iron','Maple','Oak','Pine','Rock','Wolf'], (intDiv(number, 12) % 12) + 1),
        arrayElement(['ford','ton','ville','burg','field','haven','dale','wood'], (intDiv(number, 144) % 8) + 1)
    ) AS name,
    arrayElement(['US','GB','DE','FR','ES','IT','BR','JP','AU','CA'], (number % 10) + 1) AS country,
    arrayElement(['North','South','East','West','Central'], (number % 5) + 1) AS region,
    round((cityHash64(number) % 180000) / 1000.0 - 90, 4) AS latitude,
    round((cityHash64(number + 500000) % 360000) / 1000.0 - 180, 4) AS longitude,
    toUInt32(5000 + cityHash64(number + 900000) % 2000000) AS population
FROM numbers(1000);