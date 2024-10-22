// ==UserScript==
// @name         Wayfarer Keyboard Review & One click Review
// @version      2.1.0.2
// @description  Add keyboard & One click review to Wayfarer
// @namespace    https://github.com/Shinku1014/wayfarer-addons
// @downloadURL  https://github.com/Shinku1014/wayfarer-addons/raw/main/wayfarer-keyboard-review.user.js
// @homepageURL  https://github.com/Shinku1014/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
// ==/UserScript==

// Copyright 2024 tehstone, bilde
// This file is part of the Wayfarer Addons collection.

// This script is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This script is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.    See the
// GNU General Public License for more details.

// You can find a copy of the GNU General Public License in the root
// directory of this script's GitHub repository:
// <https://github.com/tehstone/wayfarer-addons/blob/main/LICENSE>
// If not, see <https://www.gnu.org/licenses/>.

/* eslint-env es6 */
/* eslint no-var: "error" */
/* eslint indent: ['error', 2] */

var buttons = [
    {button:"1111111", APPROPRIATE: 1, SAFE: 1, ACCURATE: 1, PERMANENT: 1, SOCIALIZE: 1, EXERCISE: 1, EXPLORE: 1},
    {button:"1111122", APPROPRIATE: 1, SAFE: 1, ACCURATE: 1, PERMANENT: 1, SOCIALIZE: 1, EXERCISE: 1, EXPLORE: 2},
    {button:"1111212", APPROPRIATE: 1, SAFE: 1, ACCURATE: 1, PERMANENT: 1, SOCIALIZE: 1, EXERCISE: 2, EXPLORE: 2},
    {button:"GENERIC", APPROPRIATE: 'G', SAFE: 0, ACCURATE: 0, PERMANENT: 0, SOCIALIZE: 0, EXERCISE: 0, EXPLORE: 0},
    {button:"一问七不知", APPROPRIATE: 3, SAFE: 3, ACCURATE: 3, PERMANENT: 3, SOCIALIZE: 3, EXERCISE: 3, EXPLORE: 3},
];

var keyVal = {
    Z: { APPROPRIATE: 1, SAFE: 1, ACCURATE: 1, PERMANENT: 1, SOCIALIZE: 1, EXERCISE: 1, EXPLORE: 1},
    X: { APPROPRIATE: 1, SAFE: 1, ACCURATE: 1, PERMANENT: 1, SOCIALIZE: 1, EXERCISE: 1, EXPLORE: 2},
    C: { APPROPRIATE: 1, SAFE: 1, ACCURATE: 1, PERMANENT: 1, SOCIALIZE: 1, EXERCISE: 2, EXPLORE: 2},
    V: { APPROPRIATE: 'G', SAFE: 0, ACCURATE: 0, PERMANENT: 0, SOCIALIZE: 0, EXERCISE: 0, EXPLORE: 0},
};
/* DO NOT EDIT CODES BELOW */


(function() {
    let kdEvent = null;
    let keySequence = null;
    let wfGlobalLanguage = 'en';
    let context = {
        draw: null
    };

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/review' && method == 'GET') {
                this.addEventListener('load', checkResponse, false);
            } else if (url == '/api/v1/vault/properties' && method == 'GET') {
                // NOTE: Requires @run-at document-start.
                this.addEventListener('load', interceptProperties, false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function interceptProperties() {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (!json.result || !json.result.language) return;
            wfGlobalLanguage = json.result.language;
            console.log('Detected Wayfarer language:', wfGlobalLanguage);
        } catch (e) {
            console.error(e);
        }
    }

    function checkResponse() {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            if (!json.result) return;
            initKeyboardCtrl(json.result);
        } catch (e) {
            console.error(e);
        }
    }

    const awaitElement = get => new Promise((resolve, reject) => {
        let triesLeft = 10;
        const queryLoop = () => {
            const ref = get();
            if (ref) resolve(ref);
            else if (!triesLeft) reject();
            else setTimeout(queryLoop, 100);
            triesLeft--;
        }
        queryLoop();
    });

    const waitForDialog = () => awaitElement(() => document.querySelector('mat-dialog-container > *'));

    const getL10N = () => {
        const i18n = JSON.parse(localStorage['@transloco/translations']);
        return i18n[wfGlobalLanguage];
    };

    const getI18NPrefixResolver = prefix => {
        const l10n = getL10N();
        return id => l10n[prefix + id];
    };

    const freeHandler = () => {
        document.removeEventListener('keydown', kdEvent);
        kdEvent = null;
        keySequence = null;
    };

    const setHandler = handler => {
        if (kdEvent) freeHandler();
        document.addEventListener('keydown', kdEvent = handler);
        redrawUI();
    }

    (() => {
        document.addEventListener('keyup', e => {
            if (e.keyCode == 16) {
                keySequence = null;
                redrawUI();
            }
        });
    })();

    const initKeyboardCtrl = candidate => {
        if (kdEvent) {
            console.warn('Keydown event was not freed!');
            freeHandler();
        };
        console.log(candidate);
        awaitElement(() => (
            document.querySelector('app-review-new-b') ||
            document.querySelector('app-review-edit') ||
            document.querySelector('app-review-photo')
        )).then(ref => {
            switch (ref.tagName) {
                case 'APP-REVIEW-NEW-B':
                    initForNew(candidate);
                    break;
                case 'APP-REVIEW-EDIT':
                    initForEdit(candidate);
                    break;
                case 'APP-REVIEW-PHOTO':
                    initForPhoto(candidate);
                    break;
            }
        });
    };

    const makeKeyMap = map => e => {
        console.log(map);
        let inputActive = false;
        if (document.activeElement.tagName == 'TEXTAREA') inputActive = true;
        if (document.activeElement.tagName == 'INPUT' && !['radio', 'checkbox'].includes(document.activeElement.type.toLowerCase())) inputActive = true;
        if (inputActive && (e.code.startsWith('Numpad') || e.code.startsWith('Key') || e.code.startsWith('Digit'))) return;

        if (e.shiftKey && e.code.startsWith('Digit')) keySequence = '+' + e.code.substring(5);
        else if (e.shiftKey && e.code.startsWith('Numpad')) keySequence = '+' + e.code.substring(6);
        let idx = keySequence ? keySequence + ',' : '';
        if (!keySequence && e.shiftKey) idx += '+';
        if (e.ctrlKey) idx += '^';
        if (e.altKey) idx += '[';

        if (e.code.startsWith('Key')) idx += e.code.substring(3);
        else if (!keySequence && e.code.startsWith('Digit')) idx += e.code.substring(5);
        else if (!keySequence && e.code.startsWith('Numpad')) idx += e.code.substring(6);
        else if (keySequence) idx = keySequence;
        else if (e.keyCode >= 16 && e.keyCode <= 18) return;
        else idx += e.code;
        if (map.hasOwnProperty(idx)) {
            map[idx](e);
            e.preventDefault();
            e.stopPropagation();
        }
        redrawUI();
    };

    const isDialogOpen = diag => !!document.querySelector('mat-dialog-container' + (diag ? ' > ' + diag : ''));
    const isDialogClosing = diag => !!document.querySelector('mat-dialog-container.ng-animating' + (diag ? ' > ' + diag : ''));
    const closeDialog = () => {
        const l10n = getL10N();
        const actions = document.querySelectorAll('mat-dialog-container .mat-dialog-actions button.wf-button');
        for (let i = 0; i < actions.length; i++) {
            if (actions[i].textContent == l10n['modal.close']) {
                actions[i].click();
                return;
            }
        }
    };

    const thumbDownOpen = card => new Promise((resolve, reject) => {
        if (isDialogOpen()) {
            if (!card.opens) {
                reject();
                return;
            } else if (isDialogOpen(card.opens)) {
                resolve();
                return;
            } else {
                closeDialog();
            }
        }
        const btns = document.getElementById(card.id).querySelectorAll('button.thumbs-button');
        for (let i = 0; i < btns.length; i++) {
            if (btns[i].querySelector('mat-icon').textContent == 'thumb_down') {
                btns[i].click();
                awaitElement(() => document.querySelector('mat-dialog-container > *')).then(() => {
                    redrawUI();
                    resolve();
                });
                return;
            }
        }
        reject();
    });

    const thumb = (card, type) => {
        switch (type) {
            case 1:
                console.log(card, "thumbUp");
                document.getElementById(card.id).querySelectorAll('button.thumbs-button').forEach(btn => {
                    if (btn.querySelector('mat-icon').textContent == 'thumb_up') {
                        btn.click();
                        awaitElement(() => document.querySelector('mat-dialog-container > *')).then(redrawUI);
                        return;
                    }
                });
                break;
            case 2:
                console.log(card, "thumbDown");
                document.getElementById(card.id).querySelectorAll('button.thumbs-button').forEach(btn => {
                    if (btn.querySelector('mat-icon').textContent == 'thumb_down') {
                        btn.click();
                        awaitElement(() => document.querySelector('mat-dialog-container > *')).then(redrawUI);
                        return;
                    }
                });
                break;
            case 3:
                console.log(card, "I don't know");
                const dontKnowBtn = document.getElementById(card.id).querySelector('button.dont-know-button');
                if (dontKnowBtn) {
                    dontKnowBtn.click();
                    awaitElement(() => document.querySelector('mat-dialog-container > *')).then(redrawUI);
                }
                break;
        }
    };

    const selectDialogRadio = value => new Promise((resolve, reject) => {
        const btns = document.querySelectorAll('mat-dialog-container mat-radio-button');
        for (let i = 0; i < btns.length; i++) {
            if (btns[i].querySelector('input[type=radio]').value == value) {
                btns[i].querySelector('.mat-radio-container').click();
                resolve();
                return;
            }
        }
        reject();
    });

    const checkDialogBox = (parent, text) => new Promise((resolve, reject) => {
        const btns = !!parent ? parent.querySelectorAll('wf-checkbox') : document.querySelectorAll('mat-dialog-container wf-checkbox');
        for (let i = 0; i < btns.length; i++) {
            const label = btns[i].querySelector('.mat-checkbox-label');
            const input = btns[i].querySelector('.mat-checkbox-label app-text-input-review-b input');
            if (text && label.textContent.trim() == text) {
                label.click();
                resolve();
                return;
            } else if (!text && input) {
                label.click();
                setTimeout(() => input.focus(), 0);
                const stopInstantBlur = e => {
                    setTimeout(() => input.focus(), 0);
                    input.removeEventListener('blur', stopInstantBlur);
                };
                input.addEventListener('blur', stopInstantBlur);
                return;
            }
        }
        reject();
    });

    const expandDialogAccordionPanel = text => new Promise((resolve, reject) => {
        const panel = getDialogAccordionPanel(text);
        if (panel) {
            if (!panel.classList.contains('mat-expanded')) panel.querySelector('mat-panel-title').click();
            resolve();
            return;
        }
        reject();
    });

    const getDialogAccordionPanel = text => {
        const panels = document.querySelectorAll('mat-dialog-container mat-accordion mat-expansion-panel');
        for (let i = 0; i < panels.length; i++) {
            const label = panels[i].querySelector('mat-panel-title > div > div');
            if (label.textContent.trim() == text) {
                return panels[i];
            }
        }
        return null;
    }

    const redrawUI = () => {
        const ephemeral = document.getElementsByClassName('wfkr2-ephemeral');
        for (let i = ephemeral.length - 1; i >= 0; i--) {
            ephemeral[i].parentNode.removeChild(ephemeral[i]);
        }
        const touched = document.getElementsByClassName('wfkr2-touched');
        for (let i = touched.length - 1; i >= 0; i--) {
            for (let j = touched[i].classList.length - 1; j >= 0; j--) {
                if (touched[i].classList[j].startsWith('wfkr2-eds-')) {
                    touched[i].classList.remove(touched[i].classList[j]);
                }
            }
            touched[i].classList.remove('wfkr2-touched');
        }
        if (context.draw) context.draw();
    };

    const restyle = (e, cls) => {
        if (!e.classList.contains('wfkr2-touched')) e.classList.add('wfkr2-touched');
        if (!e.classList.contains('wfkr2-eds-' + cls)) e.classList.add('wfkr2-eds-' + cls);
    };

    const drawNew = tag => {
        const e = document.createElement(tag);
        e.classList.add('wfkr2-ephemeral');
        return e;
    }

    const ThumbCards = {
        APPROPRIATE: { id: 'appropriate-card', opens: 'app-appropriate-rejection-flow-modal' },
        SAFE: { id: 'safe-card', opens: 'app-safe-rejection-flow-modal' },
        ACCURATE: { id: 'accurate-and-high-quality-card', opens: 'app-accuracy-rejection-flow-modal' },
        PERMANENT: { id: 'permanent-location-card', opens: 'app-location-permanent-rejection-flow-modal' },
        SOCIALIZE: { id: 'socialize-card', opens: '' },
        EXERCISE: { id: 'exercise-card', opens: '' },
        EXPLORE: { id: 'explore-card', opens: '' }
    }

    const initForNew = candidate => {
        const drawThumbCard = card => {
            const idkBtn = card.querySelector('.dont-know-button');
            if (idkBtn) {
                restyle(idkBtn, 'btn-key');
                restyle(idkBtn, 'key-bracket-3');
            }
            const helpBtn = card.querySelector('.question-subtitle-tooltip');
            if (helpBtn) {
                restyle(helpBtn, 'btn-key');
                restyle(helpBtn, 'key-bracket-H');
            }
            const btns = card.querySelectorAll('button.thumbs-button');
            for (let i = 0; i < btns.length; i++) {
                restyle(btns[i], 'btn-key');
                restyle(btns[i], 'btn-key-pad');
                switch (btns[i].querySelector('mat-icon').textContent) {
                    case 'thumb_up':
                        restyle(btns[i], 'key-bracket-1');
                        break;
                    case 'thumb_down':
                        restyle(btns[i], 'key-bracket-2');
                        break;
                }
            }
            const boxes = card.querySelectorAll('label > *:last-child');
            for (let i = 0; i < boxes.length && i < 6; i++) {
                const btnKey = '' + (i + 4);
                const label = drawNew('span');
                label.classList.add('wfkr2-key-label');
                label.classList.add('wfkr2-data-key-' + btnKey);
                label.textContent = `[${btnKey}] `;
                if (boxes[i].classList.contains('mat-radio-label-content')) {
                    const textNode = boxes[i].querySelector('div');
                    textNode.insertBefore(label, textNode.firstChild);
                } else {
                    boxes[i].parentNode.insertBefore(label, boxes[i]);
                }
            }
            restyle(card.querySelector('.title-and-subtitle-row'), 'thumb-card-tassr');
            restyle(card.querySelector('.action-buttons-row'), 'thumb-card-btnr');
        };

        const findKeyBtnInCard = key => document.querySelector('#' + context.cards[context.currentCard].id + ' .wfkr2-eds-key-bracket-' + key);
        const clickThumbCardBox = key => {
            const btn = document.querySelector('#' + context.cards[context.currentCard].id + ' .wfkr2-data-key-' + key);
            if (btn) btn.closest('label').click();
        };

        const thumbCardKeys = dialog => () => ({
            '1': () => {
                if (isDialogOpen()) return;
                findKeyBtnInCard('1').click();
                context.nextCard();
            },
            '2': () => {
                if (isDialogOpen()) return;
                findKeyBtnInCard('2').click();
                if (!dialog) context.nextCard();
                else waitForDialog().then(() => redrawUI());
            },
            '3': () => {
                if (isDialogOpen()) return;
                findKeyBtnInCard('3').click();
                context.nextCard();
            },
            '4': () => clickThumbCardBox('4'),
            '5': () => clickThumbCardBox('5'),
            '6': () => clickThumbCardBox('6'),
            '7': () => clickThumbCardBox('7'),
            '8': () => clickThumbCardBox('8'),
            '9': () => clickThumbCardBox('9'),
            'H': () => {
                if (isDialogOpen()) return;
                const help = findKeyBtnInCard('H');
                if (help) help.click();
                waitForDialog().then(() => redrawUI());
            }
        });
        const dupImgs = document.querySelectorAll('#check-duplicates-card nia-map ~ * div.overflow-x-auto img.cursor-pointer');
        context = {
            draw: () => {
                if (isDialogOpen()) {
                    if (isDialogClosing()) {
                        awaitElement(() => !isDialogClosing()).then(() => redrawUI());
                        return;
                    } else if (isDialogOpen(ThumbCards.APPROPRIATE.opens)) {
                        const btns = document.querySelectorAll('mat-dialog-container mat-radio-button');
                        for (let i = 0; i < btns.length; i++) {
                            let btnKey = '';
                            switch (btns[i].querySelector('input[type=radio]').value) {
                                case 'PRIVATE': btnKey = 'P'; break;
                                case 'INAPPROPRIATE': btnKey = 'I'; break;
                                case 'SCHOOL': btnKey = 'K'; break;
                                case 'SENSITIVE': btnKey = 'S'; break;
                                case 'EMERGENCY': btnKey = 'E'; break;
                                case 'GENERIC': btnKey = 'G'; break;
                                default: continue;
                            }
                            const label = drawNew('span');
                            label.classList.add('wfkr2-key-label');
                            label.textContent = `[\u{1f879}${btnKey}] `;
                            const textNode = btns[i].querySelector('.mat-radio-label-content > div');
                            textNode.insertBefore(label, textNode.firstChild);
                        }
                    } else if (isDialogOpen(ThumbCards.ACCURATE.opens)) {
                        const aahqrl10n = getI18NPrefixResolver('review.new.question.accurateandhighquality.reject.');
                        const btns = document.querySelectorAll('mat-dialog-container wf-checkbox');
                        for (let i = 0; i < btns.length; i++) {
                            const lbl = btns[i].querySelector('.mat-checkbox-label').textContent.trim();
                            const panel = btns[i].closest('mat-expansion-panel');
                            const pnl = !!panel ? panel.querySelector('mat-panel-title > div > div').textContent.trim() : null;
                            let btnKey = '';
                            switch (pnl) {
                                case null:
                                    switch (lbl) {
                                        case aahqrl10n('inaccuratelocation'): btnKey = 'L'; break;
                                        default: continue;
                                    }
                                    break;
                                case aahqrl10n('photos'):
                                    switch (lbl) {
                                        case aahqrl10n('photos.blurry'): btnKey = '1,B'; break;
                                        case aahqrl10n('photos.face'): btnKey = '1,F'; break;
                                        case aahqrl10n('photos.license'): btnKey = '1,L'; break;
                                        case aahqrl10n('photos.orientation'): btnKey = '1,O'; break;
                                        case aahqrl10n('photos.identifiable'): btnKey = '1,I'; break;
                                        case aahqrl10n('photos.thirdparty'): btnKey = '1,T'; break;
                                        case aahqrl10n('photos.watermark'): btnKey = '1,W'; break;
                                        case aahqrl10n('photos.lowquality'): btnKey = '1,Q'; break;
                                        default: continue;
                                    }
                                    break;
                                case aahqrl10n('title'):
                                    switch (lbl) {
                                        case aahqrl10n('title.emoji'): btnKey = '2,E'; break;
                                        case aahqrl10n('title.url'): btnKey = '2,U'; break;
                                        case aahqrl10n('title.quality'): btnKey = '2,Q'; break;
                                        default: continue;
                                    }
                                    break;
                                case aahqrl10n('description'):
                                    switch (lbl) {
                                        case aahqrl10n('description.emoji'): btnKey = '3,E'; break;
                                        case aahqrl10n('description.url'): btnKey = '3,U'; break;
                                        case aahqrl10n('description.quality'): btnKey = '3,Q'; break;
                                        default: continue;
                                    }
                                    break;
                                case aahqrl10n('abuse'):
                                    switch (lbl) {
                                        case aahqrl10n('abuse.fakenomination'): btnKey = '4,F'; break;
                                        case aahqrl10n('abuse.explicit'): btnKey = '4,X'; break;
                                        case aahqrl10n('abuse.influencing'): btnKey = '4,I'; break;
                                        case aahqrl10n('abuse.offensive'): btnKey = '4,O'; break;
                                        case aahqrl10n('abuse.other'): btnKey = '4,A'; break;
                                        default: continue;
                                    }
                                    break;
                            }
                            const label = drawNew('span');
                            label.classList.add('wfkr2-key-label');
                            if (btnKey.includes(',')) {
                                if (keySequence && ('+' + btnKey).startsWith(keySequence)) {
                                    label.textContent = '\u2026' + btnKey.substring(keySequence.length).split(',').map(key => `[${key}]`).join('') + ' ';
                                } else {
                                    label.textContent = ('\u{1f879}' + btnKey).split(',').map(key => `[${key}]`).join('') + ' ';
                                }
                            } else {
                                label.textContent = `[\u{1f879}${btnKey}] `;
                            }
                            const eLbl = btns[i].querySelector('.mat-checkbox-label');
                            eLbl.parentNode.insertBefore(label, eLbl);
                        }
                        const panels = document.querySelectorAll('mat-dialog-container mat-accordion mat-expansion-panel');
                        for (let i = 0; i < panels.length; i++) {
                            const lbl = panels[i].querySelector('mat-panel-title');
                            let btnKey = '';
                            switch (lbl.querySelector('div > div').textContent.trim()) {
                                case aahqrl10n('photos'): btnKey = '1'; break;
                                case aahqrl10n('title'): btnKey = '2'; break;
                                case aahqrl10n('description'): btnKey = '3'; break;
                                case aahqrl10n('abuse'): btnKey = '4'; break;
                                default: continue;
                            }
                            const label = drawNew('span');
                            label.classList.add('wfkr2-key-label');
                            label.textContent = `[\u{1f879}${btnKey}] `;
                            lbl.parentNode.insertBefore(label, lbl);
                        }
                    } else if ('app-confirm-duplicate-modal') {
                        const cancelBtn = document.querySelector('mat-dialog-container .mat-dialog-actions button.wf-button');
                        if (cancelBtn) {
                            restyle(cancelBtn, 'btn-key');
                            restyle(cancelBtn, 'btn-key-pad');
                            restyle(cancelBtn, 'key-bracket-Esc');
                        }
                    }
                    const l10n = getL10N();
                    const actions = document.querySelectorAll('mat-dialog-container .mat-dialog-actions button.wf-button');
                    for (let i = 0; i < actions.length; i++) {
                        if (actions[i].textContent == l10n['modal.close']) {
                            restyle(actions[i], 'btn-key');
                            restyle(actions[i], 'btn-key-pad');
                            restyle(actions[i], 'key-bracket-Esc');
                            break;
                        }
                    }
                    const submitBtn = document.querySelector('mat-dialog-container .mat-dialog-actions button.wf-button--primary');
                    if (submitBtn) {
                        restyle(submitBtn, 'btn-key');
                        restyle(submitBtn, 'btn-key-pad');
                        restyle(submitBtn, 'key-bracket-Enter');
                    }
                } else {
                    const cc = context.cards[context.currentCard];
                    const card = document.getElementById(cc.id);
                    restyle(card, 'highlighted');
                    cc.draw(card);
                    /*card.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });*/
                }
            },
            cards: [
                {
                    id: 'check-duplicates-card',
                    draw: card => {
                        if (dupImgs.length) {
                            const dupImgBox = card.querySelector('#check-duplicates-card nia-map ~ * div.overflow-x-auto');
                            const dupeHelp = drawNew('p');
                            const dhK1 = document.createElement('span');
                            dhK1.classList.add('wfkr2-key-span');
                            dhK1.textContent = '[Alt]+[';
                            const dhK2 = document.createElement('span');
                            dhK2.classList.add('wfkr2-key-span');
                            dhK2.classList.add('wfkr2-key-span-wildcard');
                            dhK2.textContent = 'letter';
                            const dhK3 = document.createElement('span');
                            dhK3.classList.add('wfkr2-key-span');
                            dhK3.textContent = ']';
                            const dhK4 = document.createElement('span');
                            dhK4.classList.add('wfkr2-key-span');
                            dhK4.textContent = '[Alt]+[Shift]+[';
                            const dhK5 = document.createElement('span');
                            dhK5.classList.add('wfkr2-key-span');
                            dhK5.classList.add('wfkr2-key-span-wildcard');
                            dhK5.textContent = 'letter';
                            const dhK6 = document.createElement('span');
                            dhK6.classList.add('wfkr2-key-span');
                            dhK6.textContent = ']';
                            dupeHelp.appendChild(document.createTextNode('Press '));
                            dupeHelp.appendChild(dhK1);
                            dupeHelp.appendChild(dhK2);
                            dupeHelp.appendChild(dhK3);
                            dupeHelp.appendChild(document.createTextNode(' to pick a duplicate, or '));
                            dupeHelp.appendChild(dhK4);
                            dupeHelp.appendChild(dhK5);
                            dupeHelp.appendChild(dhK6);
                            dupeHelp.appendChild(document.createTextNode(' to open its photo in full screen'));
                            dupImgBox.parentNode.insertBefore(dupeHelp, dupImgBox);

                            for (let i = 0; i < dupImgs.length && i < 26; i++) {
                                const dpbox = drawNew('div');
                                dpbox.classList.add('wfkr2-dupe-key-box');
                                dupImgs[i].parentNode.insertBefore(dpbox, dupImgs[i]);
                                const inner = document.createElement('div');
                                inner.textContent = String.fromCharCode(65 + i);
                                dpbox.appendChild(inner);
                            }

                            const dupeBtn = card.querySelectorAll('.agm-info-window-content button.wf-button--primary');
                            for (let i = 0; i < dupeBtn.length; i++) {
                                if (dupeBtn[i] && dupeBtn[i].closest('body')) {
                                    restyle(dupeBtn[i], 'btn-key');
                                    restyle(dupeBtn[i], 'key-bracket-Enter');
                                    break;
                                }
                            }
                        }
                    },
                    extraKeys: () => {
                        const dupKeys = {
                            'Enter': () => {
                                if (!isDialogOpen()) {
                                    const dupeBtn = document.querySelectorAll('#check-duplicates-card .agm-info-window-content button.wf-button--primary');
                                    for (let i = 0; i < dupeBtn.length; i++) {
                                        if (dupeBtn[i] && dupeBtn[i].closest('body')) {
                                            dupeBtn[i].click();
                                            awaitElement(() => document.querySelector('mat-dialog-container > *')).then(() => redrawUI());
                                            break;
                                        }
                                    }
                                } else {
                                    handleEnterNew();
                                }
                            },
                            'Escape': () => {
                                if (isDialogOpen('app-confirm-duplicate-modal')) {
                                    const cancelBtn = document.querySelector('mat-dialog-container .mat-dialog-actions button.wf-button');
                                    cancelBtn.click();
                                    awaitElement(() => !isDialogOpen()).then(() => redrawUI());
                                }
                            }
                        };
                        for (let i = 0; i < dupImgs.length && i < 26; i++) {
                            const key = String.fromCharCode(65 + i);
                            const img = dupImgs[i];
                            dupKeys[`[${key}`] = () => {
                                img.click();
                                awaitElement(() => document.activeElement.tagName == 'IMG').then(() => {
                                    document.activeElement.blur()
                                    redrawUI();
                                });
                            }
                            dupKeys[`+[${key}`] = () => window.open(`${img.src}=s0`);
                        }
                        return dupKeys;
                    }
                }, {
                    id: 'appropriate-card',
                    draw: drawThumbCard,
                    extraKeys: thumbCardKeys(true)
                }, {
                    id: 'safe-card',
                    draw: drawThumbCard,
                    extraKeys: thumbCardKeys(true)
                }, {
                    id: 'accurate-and-high-quality-card',
                    draw: drawThumbCard,
                    extraKeys: thumbCardKeys(true)
                }, {
                    id: 'permanent-location-card',
                    draw: drawThumbCard,
                    extraKeys: thumbCardKeys(true)
                }, {
                    id: 'socialize-card',
                    draw: drawThumbCard,
                    extraKeys: thumbCardKeys(false)
                }, {
                    id: 'exercise-card',
                    draw: drawThumbCard,
                    extraKeys: thumbCardKeys(false)
                }, {
                    id: 'explore-card',
                    draw: drawThumbCard,
                    extraKeys: thumbCardKeys(false)
                }, {
                    id: 'categorization-card',
                    draw: card => {
                        const labels = card.querySelectorAll('mat-button-toggle-group > div');
                        for (let i = 0; i < labels.length; i++) {
                            restyle(labels[i], 'btn-key');
                            restyle(labels[i], 'key-bracket-' + (i + 1));
                            restyle(labels[i], 'btn-key-no-highlight');
                            restyle(labels[i], 'btn-key-pad');
                        }
                        const catBox = card.querySelector('mat-button-toggle-group');
                        const catHelp = drawNew('p');
                        const noAllKey = document.createElement('span');
                        noAllKey.classList.add('wfkr2-key-span');
                        noAllKey.textContent = '[Tab]';
                        catHelp.appendChild(document.createTextNode('Press '));
                        catHelp.appendChild(noAllKey);
                        catHelp.appendChild(document.createTextNode(' set all options to "No"'));
                        catBox.parentNode.insertBefore(catHelp, catBox);
                    },
                    extraKeys: () => {
                        const setAllNo = evenIfYes => {
                            const rows = document.querySelectorAll('#categorization-card mat-button-toggle-group');
                            for (let i = 0; i < rows.length; i++) {
                                if (evenIfYes || !rows[i].querySelector('mat-button-toggle.mat-button-toggle-checked')) {
                                    rows[i].querySelector('mat-button-toggle:last-of-type button').click();
                                }
                            }
                        };
                        const toggleYN = key => {
                            setAllNo(false);
                            const label = document.querySelector('#categorization-card .wfkr2-eds-key-bracket-' + key);
                            const opts = label.closest('mat-button-toggle-group').querySelectorAll('mat-button-toggle');
                            for (let i = 0; i < opts.length; i++) {
                                if (!opts[i].classList.contains('mat-button-toggle-checked')) {
                                    opts[i].querySelector('button').click(); break;
                                }
                            }
                        };
                        const keys = {
                            'Tab': () => setAllNo(true)
                        };
                        let i = 1;
                        while (candidate.hasOwnProperty('categoryIds') && i <= candidate.categoryIds.length) {
                            const key = '' + (i++);
                            keys[key] = () => toggleYN(key);
                        }
                        return keys
                    }
                }
            ],
            currentCard: 1,
            nextCard: () => {
                if (context.currentCard < context.cards.length - 1) {
                    context.currentCard++;
                    context.extraKeys = context.cards[context.currentCard].extraKeys
                    updateKeybindsNew(candidate);
                }
            },
            prevCard: () => {
                if (context.currentCard > 0) {
                    context.currentCard--;
                    context.extraKeys = context.cards[context.currentCard].extraKeys
                    updateKeybindsNew(candidate);
                }
            }
        };
        context.extraKeys = context.cards[context.currentCard].extraKeys
        updateKeybindsNew(candidate);
    };

    const handleEnterNew = () => {
        let btn = null;
        if (isDialogOpen() && !isDialogClosing()) {
            btn = document.querySelector('mat-dialog-container .mat-dialog-actions button.wf-button--primary');
        } else {
            btn = document.querySelector('app-submit-review-split-button button.wf-button--primary');
        }
        if (btn) {
            btn.click();
        }
    };
    const rate_portal = (appropriate, safe, accurate, permanent, socialize, exercise, explore) => new Promise((resolve, reject) => {
        if (appropriate == 'G')
        {
            thumbDownOpen(ThumbCards.APPROPRIATE).then(() => selectDialogRadio('GENERIC'));
            resolve();
            return;
        }
        thumb(ThumbCards.APPROPRIATE, appropriate);
        thumb(ThumbCards.SAFE, safe);
        thumb(ThumbCards.ACCURATE, accurate);
        thumb(ThumbCards.PERMANENT, permanent);
        thumb(ThumbCards.SOCIALIZE, socialize);
        thumb(ThumbCards.EXERCISE, exercise);
        thumb(ThumbCards.EXPLORE, explore);
        const setAllNo = evenIfYes => {
            const rows = document.querySelectorAll('#categorization-card mat-button-toggle-group');
            for (let i = 0; i < rows.length; i++) {
                if (evenIfYes || !rows[i].querySelector('mat-button-toggle.mat-button-toggle-checked')) {
                    rows[i].querySelector('mat-button-toggle:last-of-type button').click();
                }
            }
        };
        setAllNo(true);
        resolve();
    });



 function getDynamicNgContentAttributes(element) {
	var randomValue = null;
     Array.from(element.attributes).forEach(attr => {
        // 检查属性名是否包含 _ngcontent 或 _nghost
        if (attr.name.startsWith('_ngcontent') || attr.name.startsWith('_nghost')) {
           randomValue=attr.name.split('-')[1];
            }
    });
    return randomValue;
}

function add_button() {
    var button_region = document.getElementById("appropriate-card");
    var dynamicAttrs = getDynamicNgContentAttributes(button_region);

    var tempAttr1 = '_ngcontent-'+dynamicAttrs+'-c257';
    var tempAttr2 = '_nghost-'+dynamicAttrs+'-c253';
    var tempAttr3 = '_ngcontent-'+dynamicAttrs+'-c253';

    var questionCard = document.createElement("app-question-card");
    questionCard.setAttribute(tempAttr1,'');
    questionCard.setAttribute(tempAttr2,'');

    // 创建一个按钮容器 div，并设置样式
    var buttonContainer = document.createElement("div");
    buttonContainer.setAttribute(tempAttr3,'');
    buttonContainer.className = "flex row card w-full p-4 wf-question-card ng-star-inserted wfkr2-touched wfkr2-eds-highlighted center";

    buttonContainer.style.flexDirection = 'row'; // 水平排列
    buttonContainer.style.flexWrap = 'wrap'; // 如果按钮太多，可以换行
    buttonContainer.style.justifyContent = 'space-evenly'; // 按钮从左到右排列
    buttonContainer.style.alignItems = 'center'; // 垂直居中
    buttonContainer.style.marginTop = '10px'; // 按钮容器的上方间距

    // 遍历按钮数据并生成每个按钮
    buttons.forEach(function(button_data) {
        var button = document.createElement("button");
        var textnode = document.createTextNode(button_data["button"]);
        button.setAttribute('wf-button', '');
        button.className = "wf-button";

        // 按钮样式设置
        button.style.justifyContent = 'space-evenly'; // 按钮从左到右排列
        button.style.height = '40px'; // 按钮高度

        button.appendChild(textnode);
        buttonContainer.appendChild(button);

        // 按钮点击事件
        button.onclick = function() {
            rate_portal(button_data["APPROPRIATE"], button_data["SAFE"], button_data["ACCURATE"], button_data["PERMANENT"], button_data["SOCIALIZE"], button_data["EXERCISE"], button_data["EXPLORE"]).then(() => setTimeout(() => handleEnterNew(), 1000));
        };
    });

    // 将 buttonContainer 添加到 questionCard 组件中
    questionCard.appendChild(buttonContainer);

    // 将 questionCard 插入到 appropriate-card 之前
    button_region.parentNode.parentNode.insertBefore(questionCard, button_region.parentNode);
}
    const updateKeybindsNew = candidate => {
        const aahqrl10n = getI18NPrefixResolver('review.new.question.accurateandhighquality.reject.');
        add_button();

        setHandler(makeKeyMap({

            'Z': () => rate_portal(keyVal["Z"]["APPROPRIATE"],keyVal["Z"]["SAFE"],keyVal["Z"]["ACCURATE"],keyVal["Z"]["PERMANENT"],keyVal["Z"]["SOCIALIZE"],keyVal["Z"]["EXERCISE"],keyVal["Z"]["EXPLORE"]).then(()=> setTimeout(()=> handleEnterNew(), 1000)),
            'X': () => rate_portal(keyVal["X"]["APPROPRIATE"],keyVal["X"]["SAFE"],keyVal["X"]["ACCURATE"],keyVal["X"]["PERMANENT"],keyVal["X"]["SOCIALIZE"],keyVal["X"]["EXERCISE"],keyVal["X"]["EXPLORE"]).then(()=> setTimeout(()=> handleEnterNew(), 1000)),
            'C': () => rate_portal(keyVal["C"]["APPROPRIATE"],keyVal["C"]["SAFE"],keyVal["C"]["ACCURATE"],keyVal["C"]["PERMANENT"],keyVal["C"]["SOCIALIZE"],keyVal["C"]["EXERCISE"],keyVal["C"]["EXPLORE"]).then(()=> setTimeout(()=> handleEnterNew(), 1000)),
            'V': () => rate_portal(keyVal["V"]["APPROPRIATE"],keyVal["V"]["SAFE"],keyVal["V"]["ACCURATE"],keyVal["V"]["PERMANENT"],keyVal["V"]["SOCIALIZE"],keyVal["V"]["EXERCISE"],keyVal["V"]["EXPLORE"]).then(()=> setTimeout(()=> handleEnterNew(), 1000)),
            '+P': () => thumbDownOpen(ThumbCards.APPROPRIATE).then(() => selectDialogRadio('PRIVATE')),
            '+I': () => thumbDownOpen(ThumbCards.APPROPRIATE).then(() => selectDialogRadio('INAPPROPRIATE')),
            '+K': () => thumbDownOpen(ThumbCards.APPROPRIATE).then(() => selectDialogRadio('SCHOOL')),
            '+S': () => thumbDownOpen(ThumbCards.APPROPRIATE).then(() => selectDialogRadio('SENSITIVE')),
            '+E': () => thumbDownOpen(ThumbCards.APPROPRIATE).then(() => selectDialogRadio('EMERGENCY')),
            '+G': () => thumbDownOpen(ThumbCards.APPROPRIATE).then(() => selectDialogRadio('GENERIC')),
            '+U': () => thumbDownOpen(ThumbCards.SAFE),
            '+1': () => thumbDownOpen(ThumbCards.ACCURATE).then(() => expandDialogAccordionPanel(aahqrl10n('photos'))),
            '+1,B': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('photos')), aahqrl10n('photos.blurry')),
            '+1,F': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('photos')), aahqrl10n('photos.face')),
            '+1,L': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('photos')), aahqrl10n('photos.license')),
            '+1,O': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('photos')), aahqrl10n('photos.orientation')),
            '+1,I': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('photos')), aahqrl10n('photos.identifiable')),
            '+1,T': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('photos')), aahqrl10n('photos.thirdparty')),
            '+1,W': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('photos')), aahqrl10n('photos.watermark')),
            '+1,Q': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('photos')), aahqrl10n('photos.lowquality')),
            '+2': () => thumbDownOpen(ThumbCards.ACCURATE).then(() => expandDialogAccordionPanel(aahqrl10n('title'))),
            '+2,E': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('title')), aahqrl10n('title.emoji')),
            '+2,U': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('title')), aahqrl10n('title.url')),
            '+2,Q': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('title')), aahqrl10n('title.quality')),
            '+3': () => thumbDownOpen(ThumbCards.ACCURATE).then(() => expandDialogAccordionPanel(aahqrl10n('description'))),
            '+3,E': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('description')), aahqrl10n('description.emoji')),
            '+3,U': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('description')), aahqrl10n('description.url')),
            '+3,Q': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('description')), aahqrl10n('description.quality')),
            '+4': () => thumbDownOpen(ThumbCards.ACCURATE).then(() => expandDialogAccordionPanel(aahqrl10n('abuse'))),
            '+4,F': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('abuse')), aahqrl10n('abuse.fakenomination')),
            '+4,X': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('abuse')), aahqrl10n('abuse.explicit')),
            '+4,I': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('abuse')), aahqrl10n('abuse.influencing')),
            '+4,O': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('abuse')), aahqrl10n('abuse.offensive')),
            '+4,A': () => checkDialogBox(getDialogAccordionPanel(aahqrl10n('abuse')), aahqrl10n('abuse.other')),
            '+L': () => thumbDownOpen(ThumbCards.ACCURATE).then(() => checkDialogBox(null, aahqrl10n('inaccuratelocation'))),
            '+O': () => thumbDownOpen(ThumbCards.ACCURATE).then(() => checkDialogBox(null, null)),
            '+T': () => thumbDownOpen(ThumbCards.PERMANENT),
            'Q': () => window.open(candidate.imageUrl + '=s0'),
            'E': () => window.open(candidate.supportingImageUrl + '=s0'),
            'Tab': () => !isDialogOpen() && context.nextCard(),
            '+Tab': () => !isDialogOpen() && context.prevCard(),
            'ArrowDown': () => !isDialogOpen() && context.nextCard(),
            'ArrowUp': () => !isDialogOpen() && context.prevCard(),
            'ArrowRight': () => !isDialogOpen() && context.nextCard(),
            'ArrowLeft': () => !isDialogOpen() && context.prevCard(),
            'Enter': () => handleEnterNew(),
            ...context.extraKeys()
        }));
    };

    const initForPhoto = candidate => {
        const acceptAll = document.querySelector('app-review-photo app-accept-all-photos-card .photo-card');

        context = {
            draw: () => {
                const infoCard = document.querySelector('app-review-photo .review-photo__info div');
                console.log(infoCard);
                const photoHelp = drawNew('p');
                photoHelp.style.marginTop = '10px';
                const phK1 = document.createElement('span');
                phK1.classList.add('wfkr2-key-span');
                phK1.textContent = '[';
                const phK2 = document.createElement('span');
                phK2.classList.add('wfkr2-key-span');
                phK2.classList.add('wfkr2-key-span-wildcard');
                phK2.textContent = 'letter';
                const phK3 = document.createElement('span');
                phK3.classList.add('wfkr2-key-span');
                phK3.textContent = ']';
                const phK4 = document.createElement('span');
                phK4.classList.add('wfkr2-key-span');
                phK4.textContent = '[Shift]+[';
                const phK5 = document.createElement('span');
                phK5.classList.add('wfkr2-key-span');
                phK5.classList.add('wfkr2-key-span-wildcard');
                phK5.textContent = 'letter';
                const phK6 = document.createElement('span');
                phK6.classList.add('wfkr2-key-span');
                phK6.textContent = ']';
                photoHelp.appendChild(document.createTextNode('Press '));
                photoHelp.appendChild(phK1);
                photoHelp.appendChild(phK2);
                photoHelp.appendChild(phK3);
                photoHelp.appendChild(document.createTextNode(' reject a photo, or '));
                photoHelp.appendChild(phK4);
                photoHelp.appendChild(phK5);
                photoHelp.appendChild(phK6);
                photoHelp.appendChild(document.createTextNode(' to open it in full screen'));
                infoCard.appendChild(photoHelp);

                for (let i = 0; i < context.cards.length; i++) {
                    const actions = context.cards[i].querySelector('.photo-card__actions');
                    const label = drawNew('span');
                    label.classList.add('wfkr2-key-label');
                    label.classList.add('wfkr2-photo-card-label');
                    label.textContent = String.fromCharCode(65 + i);
                    actions.insertBefore(label, actions.firstChild);
                }

                const label = drawNew('span');
                label.classList.add('wfkr2-key-label');
                label.textContent = '[Tab]';
                const acceptAllText = acceptAll.querySelector('span');
                acceptAllText.insertBefore(label, acceptAllText.firstChild);
            },
            cards: document.querySelectorAll('app-review-photo app-photo-card .photo-card')
        };
        const keys = {
            'Tab': () => acceptAll.click(),
            'Enter': () => handleEnterNew()
        };
        for (let i = 0; i < context.cards.length; i++) {
            const card = context.cards[i];
            keys[String.fromCharCode(65 + i)] = () => card.click();
            keys['+' + String.fromCharCode(65 + i)] = () => window.open(card.querySelector('.photo-card__photo img').src + '=s0');
        }
        setHandler(makeKeyMap(keys));
    };

    const initForEdit = candidate => {
        const drawTextEdit = card => {
            const btns = card.querySelectorAll('mat-radio-button');
            for (let i = 0; i < btns.length && i < 9; i++) {
                let btnKey = (i + 1) + '';
                const label = drawNew('span');
                label.classList.add('wfkr2-key-label');
                label.textContent = `[${btnKey}] `;
                const textNode = btns[i].querySelector('.mat-radio-label-content fragment') || btns[i].querySelector('.mat-radio-label-content');
                textNode.insertBefore(label, textNode.firstChild);
            }
        };
        const handleTextEditKeys = selector => () => {
            const keys = {};
            const btns = document.querySelectorAll(`${selector} mat-radio-button label`);
            for (let i = 0; i < btns.length && i < 9; i++) {
                const btn = btns[i];
                keys['' + (i + 1)] = () => {
                    btn.click();
                    context.nextCard();
                }
            }
            return keys;
        };

        context = {
            draw: () => {
                while (context.markers.length) {
                    context.markers.pop().setMap(null);
                }
                const cc = context.cards[context.currentCard];
                const card = document.querySelector(cc.selector);
                restyle(card, 'highlighted');
                cc.draw(card);
            },
            cards: [
                {
                    selector: 'app-select-title-edit wf-review-card',
                    draw: drawTextEdit,
                    extraKeys: handleTextEditKeys('app-select-title-edit wf-review-card')
                }, {
                    selector: 'app-select-description-edit wf-review-card',
                    draw: drawTextEdit,
                    extraKeys: handleTextEditKeys('app-select-description-edit wf-review-card')
                }, {
                    selector: 'app-select-location-edit wf-review-card',
                    draw: card => {
                        const gmap = card.querySelector('nia-map');
                        const { map } = gmap.__ngContext__[gmap.__ngContext__.length - 1].componentRef;
                        if (!map) {
                            setTimeout(redrawUI, 50);
                        } else {
                            candidate.locationEdits.forEach((marker, i) => {
                                if (i >= 26) return;
                                const labelMarker = new google.maps.Marker({
                                    position: {
                                        lat: parseFloat(marker.lat),
                                        lng: parseFloat(marker.lng)
                                    },
                                    label: {
                                        text: String.fromCharCode(65 + i),
                                        fontWeight: 'bold'
                                    },
                                    clickable: false,
                                    zIndex: 1000,
                                    map
                                });
                                context.markers.push(labelMarker);
                            });
                        }
                    },
                    extraKeys: () => {
                        const keys = {};
                        for (let i = 0; i < candidate.locationEdits.length && i < 26; i++) {
                            const idx = i;
                            keys[String.fromCharCode(65 + idx)] = () => {
                                const gmap = document.querySelector('app-select-location-edit wf-review-card nia-map');
                                const { markers } = gmap.__ngContext__[gmap.__ngContext__.length - 1].componentRef;
                                const defaultMarker = markers.default.markers.filter(m => m.id == candidate.locationEdits[idx].hash)[0];
                                markers.default.markerOnClick(defaultMarker);
                            }
                        }
                        return keys;
                    }
                }
            ].filter(ch => !!document.querySelector(ch.selector)),
            markers: [],
            currentCard: 0,
            nextCard: () => {
                if (context.currentCard < context.cards.length - 1) {
                    context.currentCard++;
                    context.extraKeys = context.cards[context.currentCard].extraKeys
                    updateKeybindsEdit(candidate);
                }
            },
            prevCard: () => {
                if (context.currentCard > 0) {
                    context.currentCard--;
                    context.extraKeys = context.cards[context.currentCard].extraKeys
                    updateKeybindsEdit(candidate);
                }
            }
        };
        context.extraKeys = context.cards[context.currentCard].extraKeys
        updateKeybindsEdit(candidate);
    };

    const updateKeybindsEdit = candidate => {
        console.log(context.currentCard);
        const aahqrl10n = getI18NPrefixResolver('review.new.question.accurateandhighquality.reject.');
        setHandler(makeKeyMap({
            'Tab': () => context.nextCard(),
            '+Tab': () => context.prevCard(),
            'ArrowDown': () => context.nextCard(),
            'ArrowUp': () => context.prevCard(),
            'ArrowRight': () => context.nextCard(),
            'ArrowLeft': () => context.prevCard(),
            'Enter': () => handleEnterNew(),
            ...context.extraKeys()
        }));
    };

    (() => {
        const keyList = [
            ...[...Array(27).keys()].map(e => String.fromCharCode(64 + e)),
            ...[...Array(10).keys()].map(e => '' + e),
            'Esc', 'Tab', 'Enter'
        ];
        const edsKeys = keyList.map(key => `.wfkr2-eds-key-bracket-${key}::before { content: '[${key}]'; }`).join('\n');

        const css = `
	    .wfkr2-eds-highlighted {
            border-width: 1px;
		    border-color: #df471c;
	    }
	    .dark .wfkr2-eds-highlighted {
		    border-color: #20B8E3;
	    }
        .wfkr2-eds-btn-key::before, .wfkr2-key-label, .wfkr2-key-span {
            color: #FF6D38;
            font-family: monospace;
            text-transform: none;
            display: inline-block;
        }
        .wfkr2-key-span-wildcard {
            color: #20B8E3;
        }
        .wfkr2-eds-btn-key-no-highlight::before {
            color: black;
        }
        .dark .wfkr2-eds-btn-key-no-highlight::before {
            color: white;
        }
        .wfkr2-eds-btn-key-pad::before, .wfkr2-key-label {
            margin-right: 5px;
        }
        .wfkr2-eds-btn-key.is-selected::before, .wfkr2-eds-btn-key.wf-button--primary::before {
            color: black;
        }
        .wfkr2-eds-thumb-card-btnr {
            width: 43% !important;
        }
        .wfkr2-eds-thumb-card-tassr {
            width: 57% !important;
        }
        .wfkr2-photo-card-label {
            font-size: 1.9em;
            display: inline-block;
            padding: 0 0.5em;
        }

        ${edsKeys}

        .wfkr2-dupe-key-box {
            width: 0;
            z-index: 10;
        }
        .wfkr2-dupe-key-box > div {
            width: 1.7em;
            margin: 5px;
            text-align: center;
            font-weight: bold;
            font-size: 1.3em;
            border: 1px solid black;
            pointer-events: none;
            background: rgba(0,0,0,0.5);
            color: #FF6D38;
        }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        // We're loading this script on document-start, which means <head> does not exist yet.
        // Wait for it to start existing before we try to add the CSS to it.
        const tryAdd = setInterval(() => {
            const head = document.querySelector('head');
            if (head) {
                clearInterval(tryAdd);
                console.log('Injecting styles...');
                head.appendChild(style);
            }
        }, 100);
    })();

})();