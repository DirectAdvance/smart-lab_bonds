// ==UserScript==
// @name         Smart-Lab Bonds Profit Calculator
// @namespace    http://tampermonkey.net/
// @version      2.4
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
    const KEY_RATE = 15;  // % ЦБ — обновить вручную при изменении ставки
    const DEPOSIT_NET = KEY_RATE * (1 - TAX_RATE); // ~13.05% — депозит после налога

    // Fixed column indices in flex-table__r-table (0-based)
    // Confirmed via DOM inspection: col 0 = hidden, 1 = Лет до погаш., 7 = Купон руб, 8 = Частота, 9 = НКД, 11 = Цена
    const COL = {
        years:     1,
        coupon:    7,
        frequency: 8,
        nkd:       9,
        price:     11,
    };

    // Shadow DOM tooltip — isolated from site CSS
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;display:none';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
        <style>
            :host { all: initial; }
            #tip {
                background: #1a1a2e;
                color: #e0e0e0;
                border: 1px solid #555;
                border-radius: 8px;
                padding: 10px 14px;
                font-size: 12px;
                font-family: monospace;
                line-height: 1.8;
                box-shadow: 0 4px 20px rgba(0,0,0,0.6);
                min-width: 230px;
                display: block;
                overflow: visible;
            }
            .row {
                display: flex;
                justify-content: space-between;
                gap: 16px;
            }
            .lbl { color: #888; white-space: nowrap; }
            .val { white-space: nowrap; font-weight: bold; text-align: right; }
            .sep { border: none; border-top: 1px solid #444; margin: 5px 0; }
            .green { color: #4caf50; font-size: 14px; }
            .yellow { color: #ffb300; font-size: 14px; }
            .red { color: #ef5350; font-size: 14px; }
            .tax { color: #ef9a9a; }
        </style>
        <div id="tip"></div>
    `;
    const tooltip = shadow.getElementById('tip');

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
        const roiAnnual     = (Math.pow(1 + net / invested, 1 / years) - 1) * 100;
        return { net, roi, roiAnnual, invested, gross, actualPrice, remaining, totalCoupons, nkd, years };
    }

    function line(label, value, cls) {
        return `<div class="row"><span class="lbl">${label}</span><span class="val ${cls||''}">${value}</span></div>`;
    }

    function renderTooltip(r) {
        const cls = r.roi >= 15 ? 'green' : r.roi >= 10 ? 'yellow' : 'red';
        const tax = r.gross * TAX_RATE;
        return [
            line('Вложить (цена + НКД):', fmt(r.invested, 2) + ' ₽'),
            line('Купонов до погашения:', r.remaining + ' шт'),
            line('Купонный доход всего:', fmt(r.totalCoupons, 2) + ' ₽'),
            line('Прибыль до налога:',   fmt(r.gross, 2) + ' ₽'),
            line('Налог 13%:',           '−' + fmt(tax, 2) + ' ₽', 'tax'),
            '<hr class="sep">',
            line('Прибыль нетто:',       fmt(r.net, 2) + ' ₽',     cls),
            line('ROI от вложенных:',    r.roi.toFixed(2) + '%',                                            cls),
            line('Годовых нетто (−13%):', (isNaN(r.roiAnnual) ? '?' : r.roiAnnual.toFixed(2)) + '%/год',  cls),
        ].join('');
    }

    function positionTooltip(e) {
        const m = 16;
        const tw = host.offsetWidth  || 250;
        const th = host.offsetHeight || 170;
        let x = e.clientX + m;
        let y = e.clientY + m;
        if (y + th > window.innerHeight - 8) y = e.clientY - th - m;
        if (x + tw > window.innerWidth - 8)  x = e.clientX - tw - m;
        host.style.left = x + 'px';
        host.style.top  = y + 'px';
    }

    function calcFromCells(cells) {
        return calcProfit(
            parseNum(cells[COL.years]?.textContent, false),
            parseNum(cells[COL.coupon]?.textContent, false),
            parseNum(cells[COL.frequency]?.textContent, false),
            parseNum(cells[COL.nkd]?.textContent, true),
            parseNum(cells[COL.price]?.textContent, false)
        );
    }

    // Process one right-table row. Mark it with data-bc so we don't re-process
    // the same DOM node. After React re-render, new <tr> nodes have no data-bc
    // and will be picked up on the next interval tick.
    function processRow(row, leftRow) {
        if (row.dataset.bc) return;
        const cells = row.querySelectorAll('td');
        if (cells.length < 12) return;
        row.dataset.bc = '1';

        const result = calcFromCells(cells);
        if (result && !isNaN(result.roiAnnual)) {
            const bg = result.roiAnnual >= DEPOSIT_NET + 2 ? '#c8f0c8'
                     : result.roiAnnual >= DEPOSIT_NET     ? '#f5eaaa'
                                                           : '#f0c8c8';
            row.style.setProperty('background', bg, 'important');
            if (leftRow) leftRow.style.setProperty('background', bg, 'important');
        }

        row.addEventListener('mouseenter', e => {
            const c = row.querySelectorAll('td');
            if (c.length < 12) { host.style.display = 'none'; return; }
            const r = calcFromCells(c);
            if (!r) { host.style.display = 'none'; return; }
            tooltip.innerHTML = renderTooltip(r);
            host.style.display = 'block';
            positionTooltip(e);
        });
        row.addEventListener('mousemove',  positionTooltip);
        row.addEventListener('mouseleave', () => { host.style.display = 'none'; });
    }

    // Run forever — handles initial load AND React re-renders (filter changes etc.)
    setInterval(() => {
        const dataTable = document.querySelector('table.flex-table__r-table');
        if (!dataTable) return;
        const leftTable = document.querySelector('table.flex-table__l-table');
        const leftRows  = leftTable ? Array.from(leftTable.querySelectorAll('tr')) : [];
        dataTable.querySelectorAll('tr').forEach((row, idx) => processRow(row, leftRows[idx]));
    }, 500);

})();
