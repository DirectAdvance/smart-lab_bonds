// ==UserScript==
// @name         Smart-Lab Bonds Profit Calculator
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Показывает расчёт прибыли при наведении на строку облигации
// @author       Mi
// @match        https://smart-lab.ru/q/bonds/
// @match        https://smart-lab.ru/q/bonds/*
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/DirectAdvance/smart-lab_bonds/main/smartlab_profit_calc.user.js
// @downloadURL  https://raw.githubusercontent.com/DirectAdvance/smart-lab_bonds/main/smartlab_profit_calc.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log('[BondsCalc] v2.5 loaded');

    const NOMINAL = 1000;
    const TAX_RATE = 0.13;
    const KEY_RATE = 15;
    const DEPOSIT_NET = KEY_RATE * (1 - TAX_RATE);

    const COL = { years: 1, coupon: 7, frequency: 8, nkd: 9, price: 11 };

    // Inject CSS classes — more robust than inline styles
    const style = document.createElement('style');
    style.textContent = [
        'tr.bc-green, tr.bc-green td { background: #c8f0c8 !important; }',
        'tr.bc-yellow, tr.bc-yellow td { background: #f5eaaa !important; }',
        'tr.bc-red, tr.bc-red td { background: #f0c8c8 !important; }',
    ].join('\n');
    document.head.appendChild(style);

    // Shadow DOM tooltip
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;display:none';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
        <style>
            :host { all: initial; }
            #tip {
                background: #1a1a2e; color: #e0e0e0;
                border: 1px solid #555; border-radius: 8px;
                padding: 10px 14px; font-size: 12px; font-family: monospace;
                line-height: 1.8; box-shadow: 0 4px 20px rgba(0,0,0,0.6);
                min-width: 230px; display: block;
            }
            .row { display: flex; justify-content: space-between; gap: 16px; }
            .lbl { color: #888; white-space: nowrap; }
            .val { white-space: nowrap; font-weight: bold; text-align: right; }
            .sep { border: none; border-top: 1px solid #444; margin: 5px 0; }
            .green { color: #4caf50; font-size: 14px; }
            .yellow { color: #ffb300; font-size: 14px; }
            .red { color: #ef5350; font-size: 14px; }
            .tax { color: #ef9a9a; }
        </style>
        <div id="tip"></div>`;
    const tooltip = shadow.getElementById('tip');

    function parseNum(text, zeroOnDash) {
        if (!text) return zeroOnDash ? 0 : null;
        const s = text.trim().replace(',', '.');
        if (s === '-' || s === '' || s === '—') return zeroOnDash ? 0 : null;
        const n = parseFloat(s);
        return isNaN(n) ? (zeroOnDash ? 0 : null) : n;
    }

    function fmt(n, d) {
        return n.toLocaleString('ru-RU', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
    }

    function calcProfit(years, couponRub, frequency, nkd, pricePct) {
        if (years === null || couponRub === null || frequency === null || pricePct === null) return null;
        if (years <= 0 || frequency <= 0 || pricePct <= 0) return null;
        const actualPrice  = pricePct / 100 * NOMINAL;
        const invested     = actualPrice + nkd;
        const remaining    = Math.round(years * frequency);
        const totalCoupons = couponRub * remaining;
        const gross        = (NOMINAL - actualPrice) + (totalCoupons - nkd);
        const net          = gross * (1 - TAX_RATE);
        const roi          = invested > 0 ? net / invested * 100 : null;
        const roiAnnual    = (Math.pow(1 + net / invested, 1 / years) - 1) * 100;
        return { net, roi, roiAnnual, invested, gross, actualPrice, remaining, totalCoupons, nkd, years };
    }

    function line(label, value, cls) {
        return '<div class="row"><span class="lbl">' + label + '</span><span class="val ' + (cls || '') + '">' + value + '</span></div>';
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
            line('Прибыль нетто:',       fmt(r.net, 2) + ' ₽', cls),
            line('ROI от вложенных:',    r.roi.toFixed(2) + '%', cls),
            line('Годовых нетто (−13%):', (isNaN(r.roiAnnual) ? '?' : r.roiAnnual.toFixed(2)) + '%/год', cls),
        ].join('');
    }

    function positionTooltip(e) {
        const m = 16, tw = host.offsetWidth || 250, th = host.offsetHeight || 170;
        let x = e.clientX + m, y = e.clientY + m;
        if (y + th > window.innerHeight - 8) y = e.clientY - th - m;
        if (x + tw > window.innerWidth - 8)  x = e.clientX - tw - m;
        host.style.left = x + 'px';
        host.style.top  = y + 'px';
    }

    function calcFromCells(cells) {
        return calcProfit(
            parseNum(cells[COL.years]    && cells[COL.years].textContent,     false),
            parseNum(cells[COL.coupon]   && cells[COL.coupon].textContent,    false),
            parseNum(cells[COL.frequency]&& cells[COL.frequency].textContent, false),
            parseNum(cells[COL.nkd]      && cells[COL.nkd].textContent,       true),
            parseNum(cells[COL.price]    && cells[COL.price].textContent,     false)
        );
    }

    function processRow(row, leftRow) {
        if (row.dataset.bc) return;
        var cells = row.querySelectorAll('td');
        if (cells.length < 12) return;
        row.dataset.bc = '1';

        var result = calcFromCells(cells);
        if (result && !isNaN(result.roiAnnual)) {
            var cls = result.roiAnnual >= DEPOSIT_NET + 2 ? 'bc-green'
                    : result.roiAnnual >= DEPOSIT_NET     ? 'bc-yellow'
                                                          : 'bc-red';
            row.classList.add(cls);
            if (leftRow) leftRow.classList.add(cls);
        }

        row.addEventListener('mouseenter', function(e) {
            var c = row.querySelectorAll('td');
            if (c.length < 12) { host.style.display = 'none'; return; }
            var r = calcFromCells(c);
            if (!r) { host.style.display = 'none'; return; }
            tooltip.innerHTML = renderTooltip(r);
            host.style.display = 'block';
            positionTooltip(e);
        });
        row.addEventListener('mousemove',  positionTooltip);
        row.addEventListener('mouseleave', function() { host.style.display = 'none'; });
    }

    var processed = 0;
    setInterval(function() {
        var dataTable = document.querySelector('table.flex-table__r-table');
        if (!dataTable) return;
        var leftTable = document.querySelector('table.flex-table__l-table');
        var leftRows  = leftTable ? Array.from(leftTable.querySelectorAll('tr')) : [];
        var newRows = 0;
        dataTable.querySelectorAll('tr').forEach(function(row, idx) {
            if (!row.dataset.bc) {
                processRow(row, leftRows[idx]);
                newRows++;
            }
        });
        if (newRows > 0) {
            processed += newRows;
            console.log('[BondsCalc] colored ' + newRows + ' new rows (total: ' + processed + ')');
        }
    }, 500);

})();
