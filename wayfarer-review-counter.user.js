// ==UserScript==
// @name         Wayfarer Review Counter
// @version      0.3.9
// @description  Add review counter to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-counter.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2023 tehstone, bilde
// This file is part of the Wayfarer Addons collection.

// This script is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This script is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You can find a copy of the GNU General Public License in the root
// directory of this script's GitHub repository:
// <https://github.com/tehstone/wayfarer-addons/blob/main/LICENSE>
// If not, see <https://www.gnu.org/licenses/>.

/* eslint-env es6 */
/* eslint no-var: "error" */

(function() {

     const CURRENT_EVENT = 
    {
        from: Date.parse('2023-09-27T19:00Z'),
        to: Date.parse('2023-10-08T19:00Z'),
        label: 'Challenge:',
        color: 'goldenrod',
        currentValid: -1,
        initialized: false,
        parts: [
            {
                label: '🇮🇹',
                regions: ['IT'],
                from: Date.parse('2023-09-27T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            },
            {
                label: '🇫🇷',
                regions: ['FR'],
                from: Date.parse('2023-09-27T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            },
            {
                label: '🇩🇪',
                regions: ['DE_BB','DE_BY','DE_BE','DE_BW','DE_HB','DD_HE','DE_HH','DE_MV','DE_NI','DD_NW','DE_RP','DE_SH','DD_SL','DE_SN','DE_ST','DE_TH'],
                from: Date.parse('2023-09-27T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            },
            {
                label: '🇬🇧',
                regions: ['GB'],
                from: Date.parse('2023-09-27T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            },
             {
                label: '🇩🇰',
                regions: ['DK'],
                from: Date.parse('2023-09-27T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            },
             {
                label: '🇸🇪',
                regions: ['SE'],
                from: Date.parse('2023-09-27T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            },
             {
                label: '🇨🇭',
                regions: ['CH'],
                from: Date.parse('2023-09-27T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            },
            {
                label: '🇦🇹',
                regions: ['AT'],
                from: Date.parse('2023-09-27T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            },
             {
                label: '🇪🇸',
                regions: ['ES'],
                from: Date.parse('2023-10-04T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            },
            {
                label: '🗺️',
                regions: ['IT', 'FR', 'DE_BB','DE_BY','DE_BE','DE_BW','DE_HB','DD_HE','DE_HH','DE_MV','DE_NI','DD_NW','DE_RP','DE_SH','DD_SL','DE_SN','DE_ST','DE_TH'],
                from: Date.parse('2023-09-27T19:00Z'),
                to: Date.parse('2023-10-04T19:00Z'),
                counter: 0
            }
        ]
    };

    const PAST_EVENTS = [
        {
            from: Date.parse('2023-06-16T19:00Z'),
            to: Date.parse('2023-09-27T19:00Z'),
            label: 'Challenge:',
            color: 'goldenrod',
            currentValid: -1,
            initialized: false,
            parts: [
                {
                    label: '🗺️',
                    regions: ['Q3_ATL', 'Q3_CHI', 'Q3_HAM'],
                    from: Date.parse('2023-06-16T19:00Z'),
                    to: Date.parse('2023-09-27T19:00Z'),
                    counter: 0
                }
            ]
        },
        {
            from: Date.parse('2023-05-24T12:00Z'),
            to: Date.parse('2023-06-09T19:00Z'),
            label: 'Challenge:',
            color: 'goldenrod',
            currentValid: -1,
            initialized: false,
            parts: [
                {
                    label: '🇪🇸',
                    regions: ['ES', 'IC', 'EA'],
                    from: Date.parse('2023-05-24T12:00Z'),
                    to: Date.parse('2023-05-30T22:27Z'),
                    counter: 0
                },
                {
                    label: '🇮🇩',
                    regions: ['ID'],
                    from: Date.parse('2023-05-30T22:27Z'),
                    to: Date.parse('2023-06-02T00:06Z'),
                    counter: 0
                },
                {
                    label: '🇧🇷',
                    regions: ['BR'],
                    from: Date.parse('2023-06-02T00:06Z'),
                    to: Date.parse('2023-06-04T18:33Z'),
                    counter: 0
                },
                {
                    label: '🇮🇳',
                    regions: ['IN'],
                    from: Date.parse('2023-06-04T18:33Z'),
                    to: Date.parse('2023-06-05T22:01Z'),
                    counter: 0
                },
                {
                    label: '🗺️',
                    regions: ['ES', 'IC', 'EA', 'IN', 'BR', 'ID'],
                    from: Date.parse('2023-06-05T22:01Z'),
                    to: Date.parse('2023-06-07T23:59Z'),
                    counter: 0
                }
            ]
        }
    ];

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/review') {
                if (method == 'GET') {
                    this.addEventListener('load', injectCounter, false);
                } else if (method == 'POST') {
                    this.addEventListener('load', incrementCounter, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function incrementCounter(e) {
        if (e.target.status == 202) {
            let count = parseInt(sessionStorage.getItem('wfrcCounter') || '0');
            sessionStorage.setItem('wfrcCounter', ++count);
            if (CURRENT_EVENT.currentValid >= 0) {
                CURRENT_EVENT.parts[CURRENT_EVENT.currentValid].counter++;
                CURRENT_EVENT.currentValid = -1;
            }
        }
    }

    function injectCounter(e) {
        const ref = document.querySelector('wf-logo');
        if (!ref) {
            setTimeout(injectCounter, 200);
            return;
        }

        const div = document.createElement('div');
        div.className = 'wayfarerrctr';

        let countLabel = document.createElement('p');
        countLabel.textContent = 'Review count: ';
        let counter = document.createElement('p');
        counter.textContent = sessionStorage.getItem('wfrcCounter') || '0';
        div.appendChild(countLabel);
        div.appendChild(counter);

        function confirmReset() { 
            if (confirm('Reset review count?')) {
              sessionStorage.setItem('wfrcCounter', 0);
              counter.textContent = 0;
            }  
        }
            
        countLabel.addEventListener('click', confirmReset);
        counter.addEventListener('click', confirmReset);

        const container = ref.parentNode.parentNode;
        container.appendChild(div);

        const now = Date.now();
        const windowRef = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (CURRENT_EVENT && now >= CURRENT_EVENT.from && now <= CURRENT_EVENT.to && windowRef.wft_plugins_api && windowRef.wft_plugins_api.openIn) {
            CURRENT_EVENT.currentValid = -1;
            const WFTApi = windowRef.wft_plugins_api;
            const response = this.response;
            const json = JSON.parse(response);
            if (json && !json.captcha && json.result) {
                const nom = json.result;
                if (nom.type === 'NEW') {
                    const rs = WFTApi.openIn.getApplicableRegions(nom.lat, nom.lng);
                    for (let i = 0; i < CURRENT_EVENT.parts.length; i++) {
                        if (now >= CURRENT_EVENT.parts[i].from && now <= CURRENT_EVENT.parts[i].to && rs.some(r => CURRENT_EVENT.parts[i].regions.includes(r))) {
                            CURRENT_EVENT.currentValid = i;
                            break;
                        }
                    }
                }
            }
            const renderEventCounter = () => {
                const div = document.createElement('div');
                div.classList.add('wayfarerrctr_event');
                let countLabel = document.createElement('p');
                countLabel.textContent = CURRENT_EVENT.label;
                const evTable = document.createElement('table');
                const evRow = document.createElement('tr');
                evTable.appendChild(evRow);
                div.appendChild(countLabel);
                div.appendChild(evTable);

                const counter = document.createElement('td');
                counter.classList.add('wayfarerrctr_event_big');
                counter.textContent = CURRENT_EVENT.parts.map(p => p.counter).reduce((a, b) => a + b) + '';
                counter.style.color = CURRENT_EVENT.color;
                evRow.appendChild(counter);

                if (CURRENT_EVENT.parts.length > 1) {
                    let evPC;
                    for (let i = 0; i < CURRENT_EVENT.parts.length; i++) {
                        if (i % 2 == 0) {
                            if (evPC) evRow.appendChild(evPC);
                            evPC = document.createElement('td');
                            evPC.classList.add('wayfarerrctr_event_ptCell');
                        }
                        const evPP = document.createElement('p');
                        evPP.classList.add('wayfarerrctr_event_ptLabel');
                        evPP.textContent = CURRENT_EVENT.parts[i].label + ' ';
                        const evPN = document.createElement('span');
                        evPN.textContent = CURRENT_EVENT.parts[i].counter + '';
                        evPN.style.color = now >= CURRENT_EVENT.parts[i].from && now <= CURRENT_EVENT.parts[i].to ? CURRENT_EVENT.color : '#7f7f7f';
                        evPP.appendChild(evPN);
                        evPC.appendChild(evPP);
                    }
                    evRow.appendChild(evPC);
                }

                const container = ref.parentNode.parentNode;
                container.appendChild(div);
            };
            if (!CURRENT_EVENT.initialized) {
                CURRENT_EVENT.initialized = true;
                if (WFTApi.reviewHistory) {
                    WFTApi.reviewHistory.getAll().then(h => {
                        const matching = h.filter(n => n.type === 'NEW' && n.ts >= CURRENT_EVENT.from && n.ts <= CURRENT_EVENT.to && n.review);
                        matching.map(n => ({ rs: WFTApi.openIn.getApplicableRegions(n.lat, n.lng), ts: n.ts })).forEach(({ rs, ts }) => {
                            for (let i = 0; i < CURRENT_EVENT.parts.length; i++) {
                                if (ts >= CURRENT_EVENT.parts[i].from && ts <= CURRENT_EVENT.parts[i].to && rs.some(r => CURRENT_EVENT.parts[i].regions.includes(r))) {
                                    CURRENT_EVENT.parts[i].counter++;
                                    return;
                                }
                            }
                        });
                        renderEventCounter();
                    });
                } else {
                    CURRENT_EVENT.counter = 0;
                    renderEventCounter();
                }
            } else {
                renderEventCounter();
            }
        }
    }

    (function() {
        const css = `
          .wayfarerrctr, .wayfarerrctr_event {
              color: #333;
              margin-left: 2em;
              padding-top: 0.3em;
              text-align: center;
              display: block;
          }

          .dark .wayfarerrctr, .dark .wayfarerrctr_event {
              color: #ddd;
          }

          .wayfarerrctr p:nth-child(2), .wayfarerrctr_event_big {
              font-size: 20px;
              color: #20B8E3;
          }

          .wayfarerrctr_event table {
              width: 100%;
          }

          .wayfarerrctr_event td {
              border: none;
          }

          .wayfarerrctr_event_ptLabel {
              font-weight: bold;
              text-align: left;
          }
          .wayfarerrctr_event_ptLabel span {
              margin-left: 4px;
          }
          .wayfarerrctr_event_ptCell {
              display: none;
          }
          .wayfarerrctr_event:hover .wayfarerrctr_event_ptCell, .wayfarerrctr_event:active .wayfarerrctr_event_ptCell {
              display: table-cell;
          }
        `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    })()
})();
