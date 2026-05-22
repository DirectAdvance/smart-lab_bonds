// ==UserScript==
// @name         Smart-Lab Bonds Profit Calculator
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Добавляет колонки "Прибыль нетто" и "ROI%" в таблицу облигаций smart-lab.ru
// @author       Mi
// @match        https://smart-lab.ru/q/bonds/
// @match        https://smart-lab.ru/q/bonds/*
// @updateURL    https://raw.githubusercontent.com/DirectAdvance/smart-lab_bonds/main/smartlab_profit_calc.user.js
// @downloadURL  https://raw.githubusercontent.com/DirectAdvance/smart-lab_bonds/main/smartlab_profit_calc.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const NOMINAL = 1000;
    const TAX_RATE = 0.13;

    // Header text fragments to identify bonds table columns
    const HEADER_MAP = {
        years:     ['лет до', 'погаш'],
        coupon:    ['купон, руб', 'купон,руб'],
        frequency: ['частота', 'раз в год'],
        nkd:       ['нкд'],
        price:     ['цена'],
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
        if (years <= 0 || frequency <= 0 || pricePct <= 0) return null;
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

    // Find column indices by scanning header row text
    function detectColumns(headerRow) {
        const cells = headerRow.querySelectorAll('th, td');
        const indices = {};
        cells.forEach((cell, i) => {
            const text = cell.textContent.toLowerCase().trim();
            for (const [key, patterns] of Object.entries(HEADER_MAP)) {
                if (patterns.some(p => text.includes(p))) {
                    indices[key] = i;
                }
            }
        });
        return indices;
    }

    function isBondsTable(table) {
        const headerRow = table.querySelector('tr');
        if (!headerRow) return false;
        const text = headerRow.textContent.toLowerCase();
        // Must have at least 3 of our key headers
        const hits = ['нкд', 'купон', 'цена', 'доход', 'погаш'].filter(k => text.includes(k));
        return hits.length >= 3;
    }

    function processTable(table) {
        if (table.dataset.profitAdded) return;

        if (!isBondsTable(table)) return;

        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (!headerRow) return;

        const colIdx = detectColumns(headerRow);
        const required = ['years', 'coupon', 'frequency', 'nkd', 'price'];
        if (required.some(k => colIdx[k] === undefined)) {
            console.log('[BondsCalc] Could not detect all columns:', colIdx);
            return;
        }

        table.dataset.profitAdded = '1';

        // Add header cells
        const th1 = document.createElement('th');
        th1.textContent = 'Прибыль нетто';
        th1.title = 'Прибыль после налога 13% при удержании до погашения';
        th1.style.cssText = 'white-space:nowrap;font-size:11px;text-align:right;padding:2px 6px;cursor:default';
        const th2 = document.createElement('th');
        th2.textContent = 'ROI%';
        th2.title = 'Доходность от вложенных (цена + НКД) после налога';
        th2.style.cssText = 'white-space:nowrap;font-size:11px;text-align:right;padding:2px 6px;cursor:default';
        headerRow.appendChild(th1);
        headerRow.appendChild(th2);

        // Process data rows (skip header row)
        const allRows = table.querySelectorAll('tr');
        allRows.forEach((row, rowIdx) => {
            if (rowIdx === 0 && row === headerRow) return;
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;

            const years     = parseNum(cells[colIdx.years]?.textContent);
            const couponRub = parseNum(cells[colIdx.coupon]?.textContent);
            const frequency = parseNum(cells[colIdx.frequency]?.textContent);
            const nkd       = parseNum(cells[colIdx.nkd]?.textContent);
            const pricePct  = parseNum(cells[colIdx.price]?.textContent);

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

        console.log('[BondsCalc] Done. Columns detected:', colIdx);
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    function tryProcess() {
        const tables = document.querySelectorAll('table');
        let found = false;
        tables.forEach(t => {
            if (!t.dataset.profitAdded && isBondsTable(t)) {
                processTable(t);
                found = true;
            }
        });
        return found;
    }

    // Debounced observer — disconnect once found
    let observer;
    let debounceTimer;

    function onMutation() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (tryProcess()) {
                observer.disconnect();
            } else {
                attempts++;
                if (attempts > MAX_ATTEMPTS) observer.disconnect();
            }
        }, 500);
    }

    observer = new MutationObserver(onMutation);
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial attempts with delays
    setTimeout(() => { if (tryProcess()) observer.disconnect(); }, 1500);
    setTimeout(() => { if (tryProcess()) observer.disconnect(); }, 3000);
    setTimeout(() => { if (tryProcess()) observer.disconnect(); }, 5000);
})();
