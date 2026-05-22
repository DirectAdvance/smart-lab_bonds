// ==UserScript==
// @name         Smart-Lab Bonds Profit Calculator
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Показывает расчёт прибыли при наведении на строку облигации
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

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: fixed;
        background: #1a1a2e;
        color: #e0e0e0;
        border: 1px solid #444;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 13px;
        font-family: monospace;
        line-height: 1.7;
        pointer-events: none;
        z-index: 99999;
        display: none;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        min-width: 220px;
    `;
    document.body.appendChild(tooltip);

    function parseNum(text) {
        if (!text) return null;
        const s = text.trim().replace(',', '.');
        if (s === '-' || s === '' || s === '—') return null;
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    function fmt(n, digits = 0) {
        return n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
        return { netProfit, roi, invested, grossProfit, actualPrice, remainingCoupons, totalCouponIncome };
    }

    function roiColor(roi) {
        if (roi >= 15) return '#4caf50';
        if (roi >= 10) return '#ffb300';
        return '#ef5350';
    }

    function buildTooltip(r) {
        const color = roiColor(r.roi);
        return `
<span style="color:#aaa">Вложить (цена + НКД):</span>  <b>${fmt(r.invested, 2)} ₽</b>
<span style="color:#aaa">Купонов до погашения:</span>   <b>${r.remainingCoupons} шт</b>
<span style="color:#aaa">Купонный доход всего:</span>   <b>${fmt(r.totalCouponIncome, 2)} ₽</b>
<span style="color:#aaa">Прибыль до налога:</span>      <b>${fmt(r.grossProfit, 2)} ₽</b>
<span style="color:#aaa">Налог 13%:</span>              <b style="color:#ef9a9a">-${fmt(r.grossProfit * TAX_RATE, 2)} ₽</b>
──────────────────────────────
<span style="color:#aaa">Прибыль нетто:</span>          <b style="color:${color};font-size:14px">${fmt(r.netProfit, 2)} ₽</b>
<span style="color:#aaa">ROI от вложенных:</span>       <b style="color:${color};font-size:14px">${r.roi.toFixed(2)}%</b>
        `.trim();
    }

    function detectColumns(headerRow) {
        const cells = headerRow.querySelectorAll('th, td');
        const idx = {};
        cells.forEach((cell, i) => {
            const t = cell.textContent.toLowerCase().replace(/\s+/g, ' ').trim();
            if (t.includes('лет до') || t.includes('погаш')) idx.years = i;
            if (t.includes('купон') && (t.includes('руб') || t.match(/купон,?\s*руб/))) idx.coupon = i;
            if (t.includes('частота') || t.includes('раз в год')) idx.frequency = i;
            if (t.includes('нкд')) idx.nkd = i;
            if (t === 'цена' || t.match(/^цена/)) idx.price = i;
        });
        return idx;
    }

    function isBondsTable(table) {
        const header = table.querySelector('tr');
        if (!header) return false;
        const t = header.textContent.toLowerCase();
        const hits = ['нкд', 'купон', 'цена', 'доход', 'погаш'].filter(k => t.includes(k));
        return hits.length >= 3;
    }

    function attachTooltips(table) {
        if (table.dataset.tooltipAdded) return;

        const headerRow = table.querySelector('tr');
        if (!headerRow) return;
        if (!isBondsTable(table)) return;

        const colIdx = detectColumns(headerRow);
        const required = ['years', 'coupon', 'frequency', 'nkd', 'price'];
        if (required.some(k => colIdx[k] === undefined)) {
            console.log('[BondsCalc] Headers not found:', colIdx, '| Header text:', headerRow.textContent.trim().slice(0, 200));
            return;
        }

        table.dataset.tooltipAdded = '1';
        console.log('[BondsCalc] Attached to table. Columns:', colIdx);

        const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
        rows.forEach(row => {
            row.style.cursor = 'pointer';
            row.addEventListener('mouseenter', (e) => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 3) return;

                const years     = parseNum(cells[colIdx.years]?.textContent);
                const couponRub = parseNum(cells[colIdx.coupon]?.textContent);
                const frequency = parseNum(cells[colIdx.frequency]?.textContent);
                const nkd       = parseNum(cells[colIdx.nkd]?.textContent);
                const pricePct  = parseNum(cells[colIdx.price]?.textContent);

                const result = calcProfit(years, couponRub, frequency, nkd, pricePct);
                if (!result) {
                    tooltip.style.display = 'none';
                    return;
                }

                tooltip.innerHTML = buildTooltip(result);
                tooltip.style.display = 'block';
                positionTooltip(e);
            });

            row.addEventListener('mousemove', positionTooltip);
            row.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
        });
    }

    function positionTooltip(e) {
        const margin = 16;
        const tw = tooltip.offsetWidth || 240;
        const th = tooltip.offsetHeight || 160;
        let x = e.clientX + margin;
        let y = e.clientY + margin;
        if (x + tw > window.innerWidth - 10) x = e.clientX - tw - margin;
        if (y + th > window.innerHeight - 10) y = e.clientY - th - margin;
        tooltip.style.left = x + 'px';
        tooltip.style.top  = y + 'px';
    }

    function tryAttach() {
        document.querySelectorAll('table').forEach(t => {
            if (!t.dataset.tooltipAdded) attachTooltips(t);
        });
    }

    // Debounced observer
    let timer;
    const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(tryAttach, 600);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(tryAttach, 1500);
    setTimeout(tryAttach, 3000);
    setTimeout(tryAttach, 5000);
})();
