# Reference data for `scripts/realism-audit.js` (docs/realism.md)

- `epa/*.csv`: speed (rpm), torque (Nm), fuel rate (g/s), BSFC (g/kWh) and brake efficiency (%)
  from the US EPA's ALPHA map packages, "Fuel Map Data" sheets, as published:
  - `lv3.csv` 2014 Chevrolet 4.3L EcoTec3 LV3, Tier 2 fuel, cylinder deactivation inactive (package 10-25-18)
  - `lcv.csv` 2013 Chevrolet 2.5L Ecotec LCV, regular E10 fuel (package 03-05-18)
  - `mz20.csv` 2014 Mazda 2.0L SKYACTIV-G, LEV III fuel (package 03-29-18)
  - `f27.csv` 2015 Ford 2.7L EcoBoost V6, Tier 2 fuel (package 11-27-19)

  Citation (EPA's own): "<engine> - ALPHA Map Package. Ann Arbor MI: US EPA National Vehicle and
  Fuel Emissions Laboratory, National Center for Advanced Technology." A work of the US Government.
  Index: https://www.epa.gov/vehicle-and-fuel-emissions-testing/combining-data-complete-engine-alpha-maps
- `gm-stock-spark.json`: summary statistics (mean, minimum, maximum) of the high-octane spark tables
  and power-enrichment λ of stock GM Gen III calibrations, by engine, at two air-charge rows. The
  source states no licence, so no calibration is reproduced; the file names the images it summarises.
