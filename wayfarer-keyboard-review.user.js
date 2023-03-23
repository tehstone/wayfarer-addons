// ==UserScript==
// @name         Wayfarer Keyboard Review
// @version      0.8.7
// @description  Add keyboard review to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-keyboard-review.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

// Copyright 2022 tehstone, bilde
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

(function() {
    let ratingElements = [];
    let revPosition = 0;
    let maxRevPosition = 6;
    let rejectDepth = 0;
    let rejectOuterIdx = 0;
    let menuPosition = {};
    let isReject = false;
    let isDuplicate = false;
    let reviewType = 'NEW';
    let firstClick = true;
    let candidate;
    let locationMutationObserver = new MutationObserver(locationsMutated);
    const markerSVG = "data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='28px' height='61px' viewBox='0 0 28 61' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3EIcon-Pink%3C/title%3E%3Cg id='Icon-Pink' stroke='none' stroke-width='1' fill='none' fill-rule='evenodd'%3E%3Cpath d='M15.5093388,20.7281993 C14.9275251,20.9855232 14.2863961,21.1311947 13.6095035,21.1311947 C12.9326109,21.1311947 12.2914819,20.9855232 11.7096682,20.7281993 C10.0593063,19.997225 8.90701866,18.3486077 8.90701866,16.4278376 C8.90701866,13.8310471 11.012713,11.726225 13.6095035,11.726225 C16.206294,11.726225 18.3119883,13.8310471 18.3119883,16.4278376 C18.3119883,18.3486077 17.1597007,19.997225 15.5093388,20.7281993 M22.3271131,7.71022793 C17.5121036,2.89609069 9.70603111,2.89609069 4.89189387,7.71022793 C1.3713543,11.2307675 0.437137779,16.3484597 2.06482035,20.7281993 L2.05435293,20.7281993 L2.15379335,20.9820341 L2.20525812,21.113749 L11.1688519,44.0984412 L11.1758302,44.0984412 C11.5561462,45.0736551 12.4990855,45.7671211 13.6095035,45.7671211 C14.7190492,45.7671211 15.6619885,45.0736551 16.0431768,44.0984412 L16.0492828,44.0984412 L25.0128766,21.1163658 L25.0669582,20.9776726 L25.1637818,20.7281993 L25.1541867,20.7281993 C26.7818692,16.3484597 25.8476527,11.2307675 22.3271131,7.71022793 M13.6095035,50.6946553 C11.012713,50.6946553 8.90701866,52.7994774 8.90701866,55.3962679 C8.90701866,57.9939306 11.012713,60.099625 13.6095035,60.099625 C16.206294,60.099625 18.3119883,57.9939306 18.3119883,55.3962679 C18.3119883,52.7994774 16.206294,50.6946553 13.6095035,50.6946553' id='F' stroke='%23FFFFFF' fill='%23BB00FF'%3E%3C/path%3E%3C/g%3E%3C/svg%3E";


    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/review') {
                if (method == 'GET') {
                    this.addEventListener('load', checkResponse, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    function checkResponse(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                console.warn('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha) return;

            candidate = json.result;
            if (!candidate) {
                console.warn('Wayfarer\'s response didn\'t include a candidate.');
                return;
            }
            addCss();
            initKeyboardCtrl();

        } catch (e) {
            console.log(e); // eslint-disable-line no-console
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

    function initKeyboardCtrl() {
        awaitElement(() => (
                document.querySelector('app-should-be-wayspot') ||
                document.querySelector('app-review-edit') ||
                document.querySelector('app-review-photo')
        )).then(ref => {
            resetState();

            const ratingElementParts = document.getElementsByClassName("wf-review-card");
            if (ratingElementParts.length < 1) {
                setTimeout(initKeyboardCtrl, 100);
            }

            switch (ref.tagName) {
                case 'APP-SHOULD-BE-WAYSPOT':
                    for (let i = 0; i < ratingElementParts.length; i++) {
                        if (i == 2 || i > 7) continue;
                        ratingElements.push(ratingElementParts[i]);
                    }
                    reviewType = 'NEW';
                    setTimeout(initWhatIsItClickListeners, 500);
                    break;

                case 'APP-REVIEW-EDIT':
                    for (let i = 0; i < ratingElementParts.length; i++) {
                        if (ratingElementParts[i].parentNode.tagName == 'app-review-comments') break;
                        ratingElements.push(ratingElementParts[i]);
                    }
                    reviewType = 'EDIT';
                    labelLocationMarkers();
                    addCurrentLocationMarker();
                    break;

                case 'APP-REVIEW-PHOTO':
                    reviewType = 'PHOTO';
                    ref.querySelectorAll('.photo-card').forEach(card => card.classList.add('kbdActiveElement'));
                    document.addEventListener('keydown', keyDownEvent);
                    return;
            }

            ratingElements[0].classList.add('kbdActiveElement');
            ratingElements[0].focus();
            ratingElements[0].scrollIntoView(false);
            document.addEventListener('keydown', keyDownEvent);

            // Add CSS styling to indicate options 4 and 5 for what is it if that question is mandatory
            if (document.querySelector('.review-categorization > mat-button-toggle-group')) {
                const catCard = document.getElementById('categorization-card');
                if (catCard && !catCard.classList.contains('wbkb-yesno')) {
                    catCard.classList.add('wbkb-yesno');
                }
            }

            const dupeImages = document.querySelectorAll('app-check-duplicates img.cursor-pointer');
            for (let i = 0; i < dupeImages.length && i < 26; i++) {
                const dpbox = document.createElement('div');
                dpbox.classList.add('kbdDupeImageBox');
                dupeImages[i].parentNode.insertBefore(dpbox, dupeImages[i]);
                const inner = document.createElement('div');
                inner.textContent = String.fromCharCode(65 + i);
                dpbox.appendChild(inner);
            }

            const dupeRef = document.querySelector('app-check-duplicates nia-map');
            if (dupeRef) {
                const dupeHelp = document.createElement('p');
                dupeHelp.textContent = '\u2b06\ufe0f = Zoom in; \u2b07\ufe0f = Zoom out; [A-Z] = Open duplicate window';
                dupeHelp.classList.add('kbdDupeHelp');
                dupeRef.parentNode.insertBefore(dupeHelp, dupeRef.nextSibling);
            }
        });
    }

    function addOptionIdx(markers){
        for (let i = 0; i < markers.length; i++){
            markers[i].setAttribute('option-idx', i);
        }
    }

    function labelLocationMarkers() {
        awaitElement(() => (
            document.querySelector('app-select-location-edit agm-map div[role="button"]')
        )).then(ref => {
            addOptionIdx(document.querySelectorAll('app-select-location-edit agm-map div[role="button"]'));
            locationMutationObserver.observe(ref.parentNode, {childList: true});
        });
    }

    function locationsMutated(mutationList, observer){
        for (let i = 0; i < mutationList.length; i++){
            if (mutationList[i].addedNodes.length > 0){
                const markers = document.querySelectorAll('app-select-location-edit agm-map div[role="button"]');
                if (markers.length == candidate.locationEdits.length){
                    addOptionIdx(markers);
                }
                break;
            }
        }
    }

    function addCurrentLocationMarker() {
        awaitElement(() => (
                document.querySelector('app-select-location-edit nia-map')
        )).then(ref => {
            const gmap = document.querySelector("app-select-location-edit nia-map");
            const mapCtx = gmap.__ngContext__.at(-1);
            const map = mapCtx.componentRef.map;
            new google.maps.Marker({
              map: map,
              position: {
                lat: candidate.lat,
                lng: candidate.lng
              },
              icon:  markerSVG
            });
        });
    }

    function initWhatIsItClickListeners() {
        const whatIsItButtons = document.querySelectorAll('mat-button-toggle');
        if (whatIsItButtons.length) {
            for (let i = 0; i < whatIsItButtons.length; i+=2) {
            whatIsItButtons[i].addEventListener('click', function(e) {
                if (firstClick === true) {
                    firstClick = false;
                    const whatIsItButtons = document.querySelectorAll('.review-categorization > mat-button-toggle-group');;
                    whatIsItButtons.forEach(group => {
                        if (!group.querySelector('mat-button-toggle.mat-button-toggle-checked')) {
                            group.querySelector('mat-button-toggle:nth-child(2) button').click();
                      }
                    });
                    e.target.click();
                  }
            });
          }
        }
    }

    function keyDownEvent(e) {
        let suppress = false;
        if (['INPUT', 'TEXTAREA'].indexOf(document.activeElement.tagName) >= 0) {
            const card = document.activeElement.closest('wf-review-card');
            if (card && card.id == 'categorization-card') {
                if (e.keyCode >= 97 && e.keyCode <= 105) { // 1-9 Num pad
                    suppress = handleCustomWhatIf(card, e.keyCode - 97);
                } else if (e.keyCode >= 49 && e.keyCode <= 57) { // 1-9 normal
                    suppress = handleCustomWhatIf(card, e.keyCode - 49);
                } else if (e.keyCode === 13) { // Enter
                    trySubmit(e.ctrlKey);
                }
            } else if (isReject && e.keyCode === 27) { // escape
                cancelReject();
            } else if (isReject && e.keyCode === 13) { // 13
                suppress = true;
                submitReject(e);
            } else if (e.shiftKey && e.keyCode === 8) {
                backReject();
            }
        } else if (reviewType == 'EDIT') {
            if (e.keyCode >= 97 && e.keyCode <= 105) { // 1-9 Num pad
                suppress = setEditOption(e.keyCode - 97);
            } else if (e.keyCode >= 49 && e.keyCode <= 57) { // 1-9 normal
                suppress = setEditOption(e.keyCode - 49);
            } else if (e.keyCode >= 65 && e.keyCode <= 90) { // A-Z
                suppress = setLocationOption(e.keyCode - 65);
            } else if (e.keyCode == 9) { // Tab
                suppress = setLocationOption(-1);
            } else if (e.keyCode === 37 || e.keyCode === 8) { //Left arrow key or backspace
                suppress = updateRevPosition(-1, true);
            } else if (e.keyCode === 39) { //Right arrow key
                suppress = updateRevPosition(1, true);
            }
        } else if (reviewType == 'PHOTO') {
            if (e.keyCode >= 65 && e.keyCode <= 90) { // A-Z
                if (e.shiftKey) {
                    enlargePhoto(e.keyCode - 65);
                } else if (e.altKey) {
                    flagPhoto(e.keyCode - 65);
                } else {
                    suppress = selectPhoto(e.keyCode - 65);
                }
            } else if (e.keyCode == 9) { // Tab
                suppress = selectAllPhotosOK();
            } else if (e.keyCode === 13) { // Enter
                trySubmit(e.ctrlKey);
            }
        } else if (isDuplicate) {
            if (e.keyCode === 27) { // escape
                cancelDuplicate();
            } else if (e.keyCode === 13) { // 13
                submitDuplicate(e);
            }
        } else if (isReject) {
            if (e.keyCode >= 97 && e.keyCode <= 105) { // 1-5 Num pad
                handleRejectEntry(e, e.keyCode - 97);
            } else if (e.keyCode >= 49 && e.keyCode <= 57) { // 1-5 normal
                handleRejectEntry(e, e.keyCode - 49);
            } else if (e.keyCode === 27) { // escape
                cancelReject();
            } else if (e.keyCode === 8) { // backspace
                backReject();
            }
        } else {
            if (e.keyCode == 81) { // Q
                fullSizePhoto('app-should-be-wayspot');
            } else if (e.keyCode == 69) { // E
                fullSizePhoto('app-supporting-info');
            } else if (revPosition === 6) { // what is it? menu
                if (e.keyCode >= 97 && e.keyCode <= 102) { // 1-6 Num pad
                    suppress = setRating(e.keyCode - 97, true);
                    document.activeElement.blur();
                } else if (e.keyCode >= 49 && e.keyCode <= 54) { // 1-6 normal
                    suppress = setRating(e.keyCode - 49, true);
                    document.activeElement.blur();
                } else if (e.keyCode === 9) {
                    suppress = setRating(e.shiftKey ? -1 : -2, false);
                } else if (e.keyCode === 13) { // Enter
                    document.activeElement.blur();
                    trySubmit(e.ctrlKey);
                } else if (e.keyCode === 37 || e.keyCode === 8) { // Left arrow key or backspace
                    suppress = updateRevPosition(-1, true);
                }
            } else if (e.keyCode === 37 || e.keyCode === 8) { // Left arrow key or backspace
                suppress = updateRevPosition(-1, true);
            } else if (e.keyCode === 39) { //Right arrow key
                suppress = updateRevPosition(1, true);
            } else if (revPosition == 0 && (e.keyCode === 97 || e.keyCode === 49)) {
                suppress = setRating(0, false);
                isReject = true;
                modifyRejectionPanel();
            } else if (e.keyCode >= 97 && e.keyCode <= 101) { // 1-5 Num pad
                suppress = setRating(e.keyCode - 97, true);
            } else if (e.keyCode >= 49 && e.keyCode <= 53) { // 1-5 normal
                suppress = setRating(e.keyCode - 49, true);
            } else if (e.keyCode == 38) { // Up arrow
                zoomInOnMaps();
                suppress = true;
            } else if (e.keyCode == 40) { // Down arrow
                zoomOutOnMaps();
                suppress = true;
            } else if (revPosition == 2) { // Location/duplicate check
                if (e.keyCode >= 65 && e.keyCode <= 90) { // A-Z
                    openDuplicate(e.keyCode - 65);
                } else if (e.keyCode == 13) {
                    //document.activeElement.blur();
                    console.log(document.activeElement);
                    suppress = true;
                    markDuplicate();
                }
            } else if (e.keyCode === 13) { // Enter
                document.activeElement.blur();
                trySubmit(false);
            } else if (e.keyCode == 65) { // A
                showFullSupportingInfo();
            } else if (e.keyCode == 27) { // Escape
                exitStreetView();
            } else if (e.keyCode == 87) { // W
                scrollCardBody(-50);
            } else if (e.keyCode == 83) { // S
                scrollCardBody(50);
            } else if (e.keyCode == 68) { // D
                updateRevPosition(-10, false);
                suppress = updateRevPosition(2, false);
                exitStreetView();
            } else if (e.keyCode == 84) {
                openTranslate();
            }
        }
        if (suppress) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    function openTranslate() {
        const btn = document.querySelector('.translBtnAll');
        if (btn) btn.click();
    }

    function openDuplicate(index) {
        const dupes = document.querySelectorAll('app-check-duplicates img.cursor-pointer');
        if (dupes.length - 1 >= index) dupes[index].click();
    }

    function setRating(rate, advance){
        const starButtons = ratingElements[revPosition].getElementsByClassName("wf-rate__star");
        const whatIsButtons = ratingElements[revPosition].querySelectorAll('.review-categorization > button');
        const whatIsYN = ratingElements[revPosition].querySelectorAll('.review-categorization > mat-button-toggle-group');
        if (starButtons.length) {
            // Star rating
            starButtons[rate].click();
            if (advance) return updateRevPosition(1, false);
        } else if (whatIsYN) {
            // What is it? (Required)
            firstClick = false;
            whatIsYN.forEach(group => {
                if (rate < 0 || !group.querySelector('mat-button-toggle.mat-button-toggle-checked')) {
                    group.querySelector('mat-button-toggle:nth-child(2) button').click();
                }
            });
            if (rate >= 0 && rate <= 5) {
                if (rate >= whatIsYN.length) {
                    setTimeout(activateWhatIsOther, 50);
                    return true;
                }
                const opts = whatIsYN[rate].querySelectorAll('mat-button-toggle');
                for (let i = 0; i < opts.length; i++) {
                    if (!opts[i].classList.contains('mat-button-toggle-checked')) {
                        opts[i].querySelector('button').click();
                        break;
                    }
                }
            } else if (rate == -1) {
                setTimeout(activateWhatIsOther, 50);
                return true;
            }
            return true;
        } else if (whatIsButtons.length) {
            setTimeout(activateWhatIsOther, 50);
            return true;
        }
        return false;
    }

    function activateWhatIsOther() {
        const wfButtons = ratingElements[revPosition].getElementsByTagName("button");
        const otherButton = wfButtons[wfButtons.length - 1];
        if (otherButton) {
            otherButton.click();
            const wfinput = ratingElements[revPosition].querySelector('wf-select input');
            if (wfinput) focusWhatIsInput(wfinput);
        }
    }

    function setEditOption(option) {
        const opt = ratingElements[revPosition].querySelectorAll('mat-radio-button label')[option];
        if (opt) opt.click();
        document.activeElement.blur();
        return updateRevPosition(1, false);
    }

    function setLocationOption(option) {
        if (option >= 0) {
            const opt = ratingElements[revPosition].querySelectorAll('agm-map div[role="button"]')[option];
            if (opt) opt.click();
        } else {
            const checkbox = ratingElements[revPosition].querySelector('mat-checkbox label');
            if (checkbox) checkbox.click();
        }
        document.activeElement.blur();
        return updateRevPosition(1, false);
    }

    function selectPhoto(option) {
        const photo = document.querySelectorAll('app-review-photo app-photo-card .photo-card')[option];
        if (photo) photo.click();
        return true;
    }

    function enlargePhoto(option) {
        const photo = document.querySelectorAll('app-review-photo app-photo-card .photo-card__action')[option];
        if (photo) photo.click();
        return true;
    }

    function flagPhoto(option) {
        const photo = document.querySelectorAll('app-review-photo app-photo-card .mat-menu-trigger')[option];
        if (photo) photo.click();
        return true;
    }

    function selectAllPhotosOK() {
        const photo = document.querySelector('app-review-photo app-accept-all-photos-card .photo-card');
        if (photo) photo.click();
        return true;
    }

    "#mat-menu-panel-0 > div > button:nth-child(1)"
    "#mat-menu-panel-0 > div > button:nth-child(2)"
    "#mat-menu-panel-0 > div > button:nth-child(3)"
    function resetState() {
        ratingElements = [];
        revPosition = 0;
        rejectDepth = 0;
        rejectOuterIdx = 0;
        menuPosition = {};
        isReject = false;
        isDuplicate = false;
        firstClick = true;
    }

    function fullSizePhoto(container) {
        const closeX = document.getElementsByClassName("cdk-global-overlay-wrapper");
        if (closeX.length === 0) {
            const cont = document.getElementsByTagName(container)[0];
            const img = cont.querySelector('.wf-image-modal');
            img.click();
        } else {
            closeX[0].getElementsByTagName("button")[0].click()
        }
    }

    function showFullSupportingInfo() {
        if (document.getElementsByTagName('mat-dialog-container').length){
            document.querySelector('div.cdk-overlay-backdrop.cdk-overlay-dark-backdrop.cdk-overlay-backdrop-showing').click();
            return;
        }
        const supportingText = document.querySelector('div.cursor-pointer');
        if (supportingText) {
            supportingText.click();
        }
    }

    function zoomInOnMaps() {
        const btns = document.querySelectorAll('button[title="Zoom in"]');
        btns.forEach(e => e.click());
    }

    function zoomOutOnMaps() {
        const btns = document.querySelectorAll('button[title="Zoom out"]');
        btns.forEach(e => e.click());
    }

    function exitStreetView() {
        const button = ratingElements[revPosition].querySelector('agm-map .gm-iv-close');
        if (button) {
            const box = button.closest('div[class="gm-style"]');
            if (box.style.display !== 'none') button.click();
        }
    }

    function scrollCardBody(amount) {
        ratingElements[revPosition].querySelector('.wf-review-card__body div').scrollTop += amount;
    }

    function markDuplicate() {
        const btn = document.querySelector('app-check-duplicates nia-map .agm-map-container-inner button.wf-button[wftype="primary"]');
        if (btn !== null) {
            isDuplicate = true;
            btn.click()
        }
    }

    function cancelDuplicate() {
        const btn = document.querySelector('button[class="wf-button"]');
        if (btn !== null) {
            isDuplicate = false;
            btn.click()
        }
    }

    function submitDuplicate(e) {
        let btn = null;
        if (e.ctrlKey) {
            btn = document.querySelector('button[class="wf-button mat-menu-trigger wf-split-button__toggle wf-button--primary"]');
        } else {
            btn = document.querySelector('button[class="wf-button wf-split-button__main wf-button--primary"]');
        }
        let smartButton = document.getElementById("wayfarerrtssbutton_d");
        if (smartButton === null || smartButton === undefined) {
            let btn = null;
            if (e.ctrlKey) {
                btn = document.querySelector('button[class="wf-button mat-menu-trigger wf-split-button__toggle wf-button--primary"]');
            } else {
                btn = document.querySelector('button[class="wf-button wf-split-button__main wf-button--primary"]');
            }
            if (btn !== null) {
                isDuplicate = false;
                btn.click();
                setTimeout(submitToMenu, 250);
            }
        } else {
            smartButton.click();
        }
    }

    function modifyRejectionPanel() {
        awaitElement(() => document.querySelector("app-review-rejection-abuse-modal"))
            .then((ref) => {
                const cancelButton = document.querySelector(".mat-dialog-actions > button:nth-child(1)");
                cancelButton.addEventListener('click', function(e) {
                  isReject = false;
                  rejectDepth = 0;
                });
                const els = document.getElementsByClassName("mat-expansion-panel");
                if (els.length > 0) {
                    const first = els[0];
                    const categories = first.children[1].children[0].children[0].children;
                    for (let i = 0; i < categories.length; i++) {
                        menuPosition[i] = {"children": {}};
                        const text = categories[i].getElementsByTagName("mat-panel-title")[0].innerText;
                        if (isNaN(text[0])) {
                            const newText = i + 1 + ". " + text;
                            categories[i].getElementsByTagName("mat-panel-title")[0].innerText = newText;
                        }
                        menuPosition[i]["element"] = categories[i];

                        const childSelections = categories[i].getElementsByTagName("mat-list-option");
                        for (let j = 0; j < childSelections.length; j++) {
                            const text = childSelections[j].getElementsByClassName("mat-list-text")[0].innerText;
                            if (isNaN(text[0])) {
                                const newText = j + 1 + ". " + text;
                                childSelections[j].getElementsByClassName("mat-list-text")[0].innerText = newText;
                            }
                            menuPosition[i]["children"][j] = {};
                            menuPosition[i]["children"][j]["element"] = childSelections[j];
                        }
                    }
                    const event = new Event('rejectionDialogOpened');
                    first.dispatchEvent(event);
                }
            });
    }

    function handleRejectEntry(e, idx) {
        if (rejectDepth === 0) {
            if (idx >= Object.keys(menuPosition).length) {
                return;
            }
            e.preventDefault();
            menuPosition[idx]["element"].children[0].click();
            rejectDepth = 1;
            rejectOuterIdx = idx;
        } else if (rejectDepth === 1) {
            if (idx >= Object.keys(menuPosition[rejectOuterIdx]["children"]).length) {
                return;
            }
            e.preventDefault();
            rejectDepth = 2;
            const headers = document.getElementsByClassName("mat-expansion-panel-header");
            if (headers.length > 0) {
                headers[0].click();
                document.activeElement.blur();
            }
            menuPosition[rejectOuterIdx]["children"][idx]["element"].children[0].click();
            const ref = document.querySelector("app-review-rejection-abuse-modal");
            const textWrapper = ref.getElementsByClassName("mat-form-field-infix");
            textWrapper[0].getElementsByTagName("textArea")[0].focus();
        } else {
            return;
        }
    }

    function backReject() {
        if (rejectDepth === 2) {
            const headers = document.getElementsByClassName("mat-expansion-panel-header");
            if (headers.length > 0) {
                headers[0].click();
                document.activeElement.blur();
            }
            rejectDepth = 1;
        } else if (rejectDepth === 1) {
            const expandedCats = document.querySelectorAll('[aria-expanded="true"]');
            if (expandedCats.length > 1) {
                expandedCats[1].click();
            }
            rejectDepth = 0;
        } else {
            cancelReject();
        }
    }

    function submitReject(e) {
        if (rejectDepth <= 1) {
            return;
        }
        if (e.shiftKey) {
            return;
        }
        let smartButton = document.getElementById("wayfarerrtssbutton_r");
        if (smartButton === null || smartButton === undefined) {
            let btn = null;
            if (e.ctrlKey) {
                btn = document.querySelector('button[class="wf-button mat-menu-trigger wf-split-button__toggle wf-button--primary"]');
            } else {
                btn = document.querySelector('button[class="wf-button wf-split-button__main wf-button--primary"]');
            }
            if (btn !== null) {
                isReject = false;
                btn.click();
                setTimeout(submitToMenu, 250);
            }
        } else {
            smartButton.click();
        }
    }

    function submitToMenu() {
        const btn = document.querySelector('button[role="menuitem"]');
        if (btn !== null) {
            btn.click();
        }
    }

    function cancelReject() {
        const btn = document.querySelector('button[class="wf-button"]');
        if (btn !== null) {
            isReject = false;
            rejectDepth = 0;
            btn.click();
        }
    }

    function handleCustomWhatIf(card, idx) {
        const dropdown = card.querySelector('ng-dropdown-panel');
        const option = dropdown.querySelector(`#${dropdown.id}-${idx}`);
        if (option) option.click();
        return true;
    }

    function updateRevPosition(diff, manual) {
        ratingElements[revPosition].classList.remove('kbdActiveElement');
        revPosition += diff;
        if (revPosition < 0) {
            revPosition = 0;
        }
        if (revPosition > maxRevPosition) {
            revPosition = maxRevPosition;
        }

        ratingElements[revPosition].classList.add('kbdActiveElement');
        ratingElements[revPosition].focus();
        ratingElements[revPosition].scrollIntoView({ block: 'center' });

        if (ratingElements[revPosition].id == 'categorization-card') {
            const wfinput = ratingElements[revPosition].querySelector('wf-select input');
            if (wfinput) focusWhatIsInput(wfinput);
            return true;
        }
        return false;
    }

    function focusWhatIsInput(wfinput) {
        wfinput.focus();
        wfinput.addEventListener('keydown', e => {
            if (e.keyCode == 13) {
                e.stopPropagation();
                keyDownEvent(e);
            }
        });
    }

    function trySubmit(finish) {
        const dialog = document.querySelector('mat-dialog-container');
        if (dialog) dialog.parentNode.removeChild(dialog);
        const submitWrapper = document.getElementsByTagName("app-submit-review-split-button");
        const buttonParts = submitWrapper[0].getElementsByTagName("button");
        if (finish) {
            if (finish && buttonParts.length >= 3) {
                buttonParts[2].click();
                document.querySelector("button.mat-focus-indicator.mat-menu-item").click();
            }
            return;
        }
        let smartButton = document.getElementById("wayfarerrtssbutton_0");
        if (smartButton === null || smartButton === undefined) {
            const submitWrapper = document.getElementsByTagName("app-submit-review-split-button");
            buttonParts[0].click();
        } else {
            smartButton.click();
        }
    }

    function addCss() {
        const whatIsSelector = 'div.review-categorization__option > div > div:nth-child(1)::before'
        const whatIsOptions = [...Array(10).keys()].map(e => (`div:nth-child(${e}) > ${whatIsSelector} { content: '[${e}] '; }`)).join('\n');
        const whatIsButtons = [...Array(5).keys()].map(e => (`div.review-categorization > button:nth-child(${e})::before { content: '${e}. '; }`)).join('\n');
        const whatIsYNLabels = [...Array(7).keys()].map(e => (`div.review-categorization > mat-button-toggle-group:nth-child(${e}) > div::before { content: '[${e}]\u00a0'; }`)).join('\n');
        const editOptions = [...Array(10).keys()].map(e => (`app-review-edit mat-radio-button:nth-child(${e}) .mat-radio-label-content::before { content: '[${e}]'; }`)).join('\n');
        const photoOptions = [...Array(27).keys()].map(e => {
            const letter = String.fromCharCode(64 + e);
            return `app-photo-card:nth-child(${e}) .photo-card__actions::before { content: '${letter}'; }`;
        }).join('\n');
        const locationOptions = [...Array(26).keys()].map(e => {
            const letter = String.fromCharCode(65 + e);
            return `app-select-location-edit agm-map div[option-idx="${e}"]:before { content: '${letter}'; }`;
        }).join('\n');

        const css = `
            ${whatIsSelector} { font-family: monospace; color: white; }
            ${whatIsOptions}
            ${whatIsYNLabels}

            div.review-categorization > button::before { margin-right: 5px; }
            .dark div.review-categorization > button::before { color: white; }
            div.review-categorization > mat-button-toggle-group > div::before { font-family: monospace; color: #FF6D38; }
            div.review-categorization > mat-button-toggle-group > div { color: black !important; }
            .dark div.review-categorization > mat-button-toggle-group > div { color: white !important; }
            ${whatIsButtons}
            div.review-categorization > button:last-child::before { margin-left: -14px; }

            app-review-new #categorization-card.wbkb-yesno > div:first-child > div:first-child::after {
                content: '[Shift+Tab] = Other\\a[Tab] = Nothing';
                margin-top: 10px;
                display: block;
                white-space: pre;
                font-family: monospace;
                color: #FF6D38;
            }

            app-review-edit mat-radio-button .mat-radio-label-content::before { color: #FF6D38; font-family: monospace; }
            ${editOptions}

            app-supporting-info .wf-review-card__body .bg-gray-200 .cursor-pointer::before {
                content: '[Click here or press A for full supporting info] ';
                color: #FF6D38;
                display: block;
            }

            app-select-location-edit agm-map div[role="button"]::before { margin-left: 8px; color: black; auto; font-size: 25px; }
            app-select-location-edit mat-checkbox .mat-checkbox-label::before { content: '[Tab]'; color: #FF6D38; font-family: monospace; }
            ${locationOptions}

            app-photo-card .photo-card__actions::before { font-size: 24px; margin-right: 20px; }
            app-accept-all-photos-card .photo-card__overlay span::after {
                content: '[Press Tab to accept all photos] ';
                color: #FF6D38;
                display: block;
            }
            ${photoOptions}

        .card.kbdActiveElement {
            border-width: 1px;
        }
        .kbdActiveElement {
            border-color: #df471c;
        }
        .dark .kbdActiveElement {
            border-color: #20B8E3;
        }
        .kbdDupeImageBox {
            width: 0;
            z-index: 10;
        }
        .kbdDupeImageBox > div {
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
        .kbdDupeHelp {
            color: #FF6D38;
            font-family: monospace;
        }

        app-check-duplicates nia-map .agm-map-container-inner button.wf-button[wftype="primary"]::before {
            content: '[Enter]';
            font-family: monospace;
        }
        /* Translation button integration */
        .translBtnAll::after {
            content: '[T]';
            font-family: monospace;
            color: #FF6D38;
        }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    }

})();
