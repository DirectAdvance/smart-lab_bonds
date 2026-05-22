// ==UserScript==
// @name         Smart-Lab Bonds Profit Calculator
// @namespace    http://tampermonkey.net/
// @version      1.3
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

    // Fixed column indices in flex-table__r-table (0-based)
    // Confirmed via DOM inspection: headers in flex-table__r-header-table
    const COL = {
        years:     1,   // Лет до погаш.
        coupon:    7,   // Купон, руб
        frequency: 8,   // Частота, раз в год
        nkd:       9,   // НКД, руб  ('-' = 0)
        price:     11,  // Цена
    };

    // Tooltip element
    const tooltip = document.createElement('div');
    tooltip.style.cssText = [
        'position:fixed', 'background:#1a1a2e', 'color:#e0e0e0',
        'border:1px solid #555', 'border-radius:8px', 'padding:10px 14px',
        'font-size:12px', 'font-family:monospace', 'line-height:1.8',
        'pointer-events:none', 'z-index:99999', 'display:none',
        'box-shadow:0 4px 20px rgba(0,0,0,0.6)', 'min-width:230px',
    ].join(';');
    document.body.appendChild(tooltip);

    function parseNum(text, zeroOnDash) {
        if (!text) return zeroOnDash ? 0 : null;
        const s = text.trim().replace(',', '.');
        if (s === '-' || s === '' || s === '—') return zeroOnDash ? 0 : null;
        const n = parseFloat(s);
        return isNaN(n) ? (zeroOnDash ? 0 : null) : n;
    }

    function fmt(n, d = 0) {
        return n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    function calcProfit(years, couponRub, frequency, nkd, pricePct) {
        if (years === null || couponRub === null || frequency === null || pricePct === null) return null;
        if (years <= 0 || frequency <= 0 || pricePct <= 0) return null;
        const actualPrice   = pricePct / 100 * NOMINAL;
        const invested      = actualPrice + nkd;
        const remaining     = Math.round(years * frequency);
        const totalCoupons  = couponRub * remaining;
        const gross         = (NOMINAL - actualPrice) + (totalCoupons - nkd);
        const net           = gross * (1 - TAX_RATE);
        const roi           = invested > 0 ? net / invested * 100 : null;
        return { net, roi, invested, gross, actualPrice, remaining, totalCoupons, nkd };
    }

    function roiColor(roi) {
        if (roi >= 15) return '#4caf50';
        if (roi >= 10) return '#ffb300';
        return '#ef5350';
    }

    function row(label, value, valueStyle) {
        return `<div style="display:flex;justify-content:space-between;gap:16px">
            <span style="color:#888">${label}</span>
            <b style="${valueStyle || ''}">${value}</b>
        </div>`;
    }

    function renderTooltip(r) {
        const c = roiColor(r.roi);
        const tax = r.gross * TAX_RATE;
        return [
            row('Вложить (цена + НКД):', fmt(r.invested, 2) + ' ₽'),
            row('Купонов до погашения:', r.remaining + ' шт'),
            row('Купонный доход итого:', fmt(r.totalCoupons, 2) + ' ₽'),
            row('Прибыль до налога:', fmt(r.gross, 2) + ' ₽'),
            row('Налог 13%:', '−' + fmt(tax, 2) + ' ₽', 'color:#ef9a9a'),
            '<div style="border-top:1px solid #444;margin:6px 0"></div>',
            row('Прибыль нетто:', fmt(r.net, 2) + ' ₽', `color:${c};font-size:14px`),
            row('ROI:', r.roi.toFixed(2) + '%', `color:${c};font-size:14px`),
        ].join('');
    }

    function positionTooltip(e) {
        const m = 16, tw = tooltip.offsetWidth || 250, th = tooltip.offsetHeight || 170;
        let x = e.clientX + m, y = e.clientY + m;
        if (x + tw > window.innerWidth  - 8) x = e.clientX - tw - m;
        if (y + th > window.innerHeight - 8) y = e.clientY - th - m;
        tooltip.style.left = x + 'px';
        tooltip.style.top  = y + 'px';
    }

    function attachTooltips(dataTable) {
        if (dataTable.dataset.bondsCalc) return;
        dataTable.dataset.bondsCalc = '1';

        const rows = dataTable.querySelectorAll('tr');
        rows.forEach(row => {
            row.addEventListener('mouseenter', e => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 12) { tooltip.style.display = 'none'; return; }

                const years  = parseNum(cells[COL.years]?.textContent, false);
                const coupon = parseNum(cells[COL.coupon]?.textContent, false);
                const freq   = parseNum(cells[COL.frequency]?.textContent, false);
                const nkd    = parseNum(cells[COL.nkd]?.textContent, true);   // '-' → 0
                const price  = parseNum(cells[COL.price]?.textContent, false);

                const result = calcProfit(years, coupon, freq, nkd, price);
                if (!result) { tooltip.style.display = 'none'; return; }

                tooltip.innerHTML = renderTooltip(result);
                tooltip.style.display = 'block';
                positionTooltip(e);
            });
            row.addEventListener('mousemove',  positionTooltip);
            row.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
        });

        console.log('[BondsCalc] Attached to', rows.length, 'rows');
    }

    function tryAttach() {
        const dataTable = document.querySelector('table.flex-table__r-table');
        if (dataTable) {
            attachTooltips(dataTable);
            return true;
        }
        return false;
    }

    let timer;
    const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => { if (tryAttach()) observer.disconnect(); }, 600);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => { if (tryAttach()) observer.disconnect(); }, 1500);
    setTimeout(() => { if (tryAttach()) observer.disconnect(); }, 3000);
    setTimeout(() => { if (tryAttach()) observer.disconnect(); }, 5000);
})();
