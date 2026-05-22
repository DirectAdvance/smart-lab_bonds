// ==UserScript==
// @name         Smart-Lab Bonds Profit Calculator
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Добавляет колонки "Прибыль нетто" и "ROI%" в таблицу облигаций smart-lab.ru
// @author       Mi
// @match        https://smart-lab.ru/q/bonds/
// @match        https://smart-lab.ru/q/bonds/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const NOMINAL = 1000;
    const TAX_RATE = 0.13;

    // Column indices (0-based) in the bonds table
    const COL = {
        years:     2,   // Лет до погаш
        coupon:    8,   // Купон, руб
        frequency: 9,   // Частота, раз в год
        nkd:       10,  // НКД, руб
        price:     12,  // Цена (% от номинала)
    };

    function parseNum(text) {
        if (!text) return null;
        const s = text.trim().replace(',', '.');
        if (s === '-' || s === '' || s === '—') return null;
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    function calcProfit(years, couponRub, frequency, nkd, pricePct) {
        if ([years, couponRub, frequency, nkd, pricePct].some(v => v === null)) return null;
        const actualPrice = pricePct / 100 * NOMINAL;
        const invested = actualPrice + nkd;
        const remainingCoupons = Math.round(years * frequency);
        const totalCouponIncome = couponRub * remainingCoupons;
        const grossProfit = (NOMINAL - actualPrice) + (totalCouponIncome - nkd);
        const netProfit = grossProfit * (1 - TAX_RATE);
        const roi = invested > 0 ? (netProfit / invested * 100) : null;
        return { netProfit, roi };
    }

    function roiColor(roi) {
        if (roi === null) return '';
        if (roi >= 15) return 'color:#1a7f1a;font-weight:bold';
        if (roi >= 10) return 'color:#b8860b;font-weight:bold';
        return 'color:#cc2200;font-weight:bold';
    }

    function processTable(table) {
        if (table.dataset.profitAdded) return;
        table.dataset.profitAdded = '1';

        // Add header
        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (headerRow) {
            const th1 = document.createElement('th');
            th1.textContent = 'Прибыль нетто';
            th1.title = 'Прибыль после налога 13% при удержании до погашения';
            th1.style.cssText = 'white-space:nowrap;font-size:11px;text-align:right;padding:2px 6px';
            const th2 = document.createElement('th');
            th2.textContent = 'ROI%';
            th2.title = 'Доходность от вложенных (цена + НКД) после налога';
            th2.style.cssText = 'white-space:nowrap;font-size:11px;text-align:right;padding:2px 6px';
            headerRow.appendChild(th1);
            headerRow.appendChild(th2);
        }

        // Process data rows
        const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 13) {
                row.appendChild(document.createElement('td'));
                row.appendChild(document.createElement('td'));
                return;
            }

            const years     = parseNum(cells[COL.years]?.textContent);
            const couponRub = parseNum(cells[COL.coupon]?.textContent);
            const frequency = parseNum(cells[COL.frequency]?.textContent);
            const nkd       = parseNum(cells[COL.nkd]?.textContent);
            const pricePct  = parseNum(cells[COL.price]?.textContent);

            const result = calcProfit(years, couponRub, frequency, nkd, pricePct);

            const td1 = document.createElement('td');
            const td2 = document.createElement('td');
            td1.style.cssText = 'text-align:right;padding:2px 6px;font-size:11px';
            td2.style.cssText = 'text-align:right;padding:2px 6px;font-size:11px';

            if (result) {
                td1.textContent = result.netProfit.toFixed(1) + ' ₽';
                td2.textContent = result.roi.toFixed(1) + '%';
                td1.style.cssText += ';' + roiColor(result.roi);
                td2.style.cssText += ';' + roiColor(result.roi);
            } else {
                td1.textContent = '—';
                td2.textContent = '—';
            }

            row.appendChild(td1);
            row.appendChild(td2);
        });
    }

    function findAndProcess() {
        const tables = document.querySelectorAll('table');
        tables.forEach(t => {
            // Heuristic: bonds table has many columns
            const firstRow = t.querySelector('tr');
            if (firstRow && firstRow.querySelectorAll('td, th').length >= 12) {
                processTable(t);
            }
        });
    }

    // Wait for dynamic content
    const observer = new MutationObserver(() => findAndProcess());
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial attempt
    setTimeout(findAndProcess, 1500);
    setTimeout(findAndProcess, 3000);
})();
