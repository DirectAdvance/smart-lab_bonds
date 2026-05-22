# Smart-Lab Bonds Profit Calculator

Tampermonkey userscript: adds **"Прибыль нетто"** and **"ROI%"** columns to the bonds table on [smart-lab.ru/q/bonds/](https://smart-lab.ru/q/bonds/).

## What it does

The default smart-lab screener shows yield % but not absolute profit in rubles or ROI relative to total invested capital (price + accrued interest). This script calculates both, assuming hold-to-maturity.

**Formula:**
```
invested       = price + accrued_interest (НКД)
gross_profit   = (nominal - price) + (total_coupon_income - НКД)
net_profit     = gross_profit × 0.87   # 13% tax
ROI%           = net_profit / invested × 100
```

**Color coding:**
- Green — ROI ≥ 15%
- Yellow — ROI 10–15%
- Red — ROI < 10%

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Create new script → paste contents of `smartlab_profit_calc.user.js`
3. Save → open [smart-lab.ru/q/bonds/](https://smart-lab.ru/q/bonds/)

## Notes

- Nominal assumed 1000 ₽ (standard for Russian exchange bonds)
- Calculation is **hold-to-maturity only** — does not account for early sale
- Amortized bonds: less accurate (amortization schedule not parsed)
- Tax rate: flat 13% NDFL applied to full profit
