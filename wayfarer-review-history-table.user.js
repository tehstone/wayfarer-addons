// ==UserScript==
// @name         Wayfarer Review History Table
// @version      0.1.8
// @description  Add local review history storage to Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdn.datatables.net/1.12.1/js/jquery.dataTables.min.js
// @require      https://maxcdn.bootstrapcdn.com/bootstrap/3.4.0/js/bootstrap.min.js
// @resource     REMOTE_CSS https://cdn.datatables.net/1.12.1/css/jquery.dataTables.min.css
// @grant        GM_getResourceText
// @grant        GM_addStyle

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

(() => {
    const OBJECT_STORE_NAME = 'reviewHistory';
    GM_addStyle(GM_getResourceText("REMOTE_CSS"));

    (function (open) {
        XMLHttpRequest.prototype.open = function(method, url) {
            const args = this;
            if (url == '/api/v1/vault/profile' && method == 'GET') {
                this.addEventListener('load', handleXHRResult(renderReviewHistory), false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    // Perform validation on result to ensure the request was successful before it's processed further.
    // If validation passes, passes the result to callback function.
    const handleXHRResult = callback => function(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            if (!json.result) return;
            callback(json.result, e);
        } catch (err) {
            console.error(err);
        }
    };

    const emptyArray = Array(5).fill(0);
    function getStarRating(score) {
        return `<span style="white-space:nowrap">${emptyArray
        .map((_, i) =>
            i + 1 <= score
                ? `<span class="glyphicon glyphicon-star"></span>`
                : `<span class="glyphicon glyphicon-star-empty"></span>`
        )
        .join("")}</span>`;
    }

    const renderReviewHistory = result => new Promise((resolve, reject) => {
        getIDBInstance().then(db => {
            const toSave = [];
            const tx = db.transaction([OBJECT_STORE_NAME], 'readonly');
            tx.oncomplete = event => db.close();
            const objectStore = tx.objectStore(OBJECT_STORE_NAME);
            const getAllReviews = objectStore.getAll();
            getAllReviews.onsuccess = () => {
                const { result } = getAllReviews;
                for (let i = 0; i < result.length; i++) {
                    if (result[i]["type"] === "NEW") {
                      toSave.push(result[i]);
                    }
                }
                renderTable(toSave);
            };
        }).catch(reject);
    });

    function renderTable(reviewData) {
      const tableContainer = document.createElement("div");
      tableContainer.classList.add("table");
      tableContainer.insertAdjacentHTML("beforeend",
        `
        <div class="table-responsive">
                <table class="table table-striped table-condensed" id="review-history">
                </table>
            </div>
        `)
      const ratingNarRef = document.querySelector('wf-rating-bar');
      const container = ratingNarRef.parentNode.parentNode;
      container.appendChild(tableContainer);

      const l10n = getL10N();
      $(document).ready(function () {
      const table = $('#review-history').DataTable({
          data: reviewData,
          deferRender: true,
          order: [[0, 'desc']],
          columns: [
            {
                data: 'ts',
                defaultContent: '',
                title: "Date",
                width: "7%",
                render: (ts, type) => {
                    if (type === "display") {
                        return getFormattedDate(ts);
                    }
                    return ts;
                }
            },
            {
                data: 'title',
                title: 'Title',
                width: "16%"
            },
            {
                data: 'description',
                title: 'Description',
                defaultContent: '',
                width: "47%"
            },
            {
                data: 'review',
                defaultContent: '',
                title: 'Review',
                width: "15%",
                render: (...review) => {
                    if (review[0] !== null && review[0] !== undefined) {
                        if (review[0].quality !== undefined ) {
                            return `${review[0].quality}`;
                        } else if (review[0].rejectReason != undefined) {
                            return l10n[`reject.reason.${review[0].rejectReason.toLowerCase()}.short`];
                        } else if (review[0].duplicate != undefined) {
                            return "Duplicate";
                        } else {
                            console.log(review[0]);
                        }
                    } else {
                        return 'Skipped/Timed Out';
                    }
                }
            },
            {
                data: 'review',
                defaultContent: '',
                title: 'Location',
                width: "15%",
                render: (...review) => {
                    return `<a href="https://intel.ingress.com/?ll=${review[2].lat},${review[2].lng}&z=16" "target="_blank">${review[2].lat},${review[2].lng}</a>`;
                }
            },
            {
                data: 'id',
                visible: false
            },
          ],
      });

      $('#review-history').on("click", "", (ev) => {
            var tr = $(ev.target).closest("tr");
            var row = table.row(tr);
            const review = row.data();

            if (row.child.isShown()) {
                tr.removeClass("shown");
                row.child.hide();
            } else {
              tr.addClass("shown");
                row.child(reviewContent(review)).show();
            }
        });
    });
    }

    const reviewContent = (review) => {
      const {
                id,
                title,
                imageUrl,
                description,
                statement,
                supportingImageUrl,
                lat,
                lng,
                ts,
            } = review;
        const index = 0;
        if (review.review) {
            const {
                comment,
                newLocation,
                quality,
                spam,
                rejectReason,
                what,
                duplicate,
            } = review.review;

            const score = spam ? 1 : quality || 0;
            const status = duplicate ? "Duplicate" : review.review === "skipped" ? "Skipped" : "Timed Out/Pending";

            return `<div class="panel panel-default review-details">
          <div class="panel-heading">${title} ${score ? getStarRating(score) : status}</div>
          <div class="panel-body">
              <div class="row">
                <dl class="dl-horizontal">
                  <div class="col-xs-4"><a target="${getTarget(
                "images"
            )}" href="${imageUrl}=s0"><img style="max-width: 40%; max-height: 300px; padding: 5px; float: left;" src="${imageUrl}" class="img-responsive" alt="${title}"></a>
                  <a target="${getTarget(
                "images"
            )}" href="${supportingImageUrl}=s0"><img style="max-width: 40%; max-height: 300px; padding: 5px; float: left;" src="${supportingImageUrl}" class="img-responsive" alt="${title}"></a>
                  </div>
                </dl>
                <br>
                <div class="col-xs-12 col-sm-8" style="float: left; padding: 5px;">
                  <dl class="dl-horizontal">
                    ${getDD("Title", title)}
                    ${getDD("Description", description)}
                    ${getDD("Statement", statement)}
                    ${getDD("Comment", comment)}
                    ${getDD("New Location", newLocation)}
                    ${getDD("Reject Reason", rejectReason)}
                    ${getDD("What is it?", what)}
                    ${getDD(
                "Location",
                getIntelLink(lat, lng, `Open in Intel`)
            )}
                    ${getDD("Review Date", getFormattedDate(ts, true))}
                  </dl>
                  <dt class="bbold">Review</dt><dd>${renderScores(review)}</dd>
                  <dl class="dl-horizontal">
                    ${getDD("ID", id)}
                  </dl>
                </div>
              </div>
            </div>
          </div>`;
        } else {
            return `<div class="panel panel-default review-details">
          <div class="panel-heading">${title}</div>
          <div class="panel-body">
              <div class="row">
                <dl class="dl-horizontal">
                  <div class="col-xs-4"><a target="${getTarget(
                "images"
            )}" href="${imageUrl}=s0"><img style="max-width: 40%; max-height: 300px; padding: 5px; float: left;" src="${imageUrl}" class="img-responsive" alt="${title}"></a>
                  <a target="${getTarget(
                "images"
            )}" href="${supportingImageUrl}=s0"><img style="max-width: 40%; max-height: 300px; padding: 5px; float: left;" src="${supportingImageUrl}" class="img-responsive" alt="${title}"></a>
                  </div>
                </dl>
                <br>
                <div class="col-xs-12 col-sm-8" style="float: left; padding: 5px;">
                  <dl class="dl-horizontal">
                    ${getDD("Title", title)}
                    ${getDD("Description", description)}
                    ${getDD("Statement", statement)}
                    ${getDD(
                "Location",
                getIntelLink(lat, lng, `Open in Intel`)
            )}
                    ${getDD("Review Date", getFormattedDate(ts, true))}
                  </dl>
                  <dt class="bbold">Review</dt><dd>Skipped/Timed Out</dd>
                  <dl class="dl-horizontal">
                    ${getDD("ID", id)}
                  </dl>
                </div>
              </div>
            </div>
          </div>`;
        }
    }

    const getDD = (term, definition) =>
        definition ? `<dt class="bbold">${term}</dt><dd>${definition}</dd>` : "";;

    const dateSettings = {
        day: "numeric",
        month: "numeric",
        year: "numeric",
    };

    const getFormattedDate = (ts, fullDate) => {
      try {
          const date = new Date(Number(ts));

          if (fullDate) {
              return date.toString();
          }

          return new Intl.DateTimeFormat("default", dateSettings).format(date);
      } catch(err) {
        console.log(`failed to parse date: ${ts}`);
        return ts;
      }
    };

    const getTarget = (target) => {
        return "_blank";
    };

    const getIntelLink = (lat, lng, content) =>
        `<a target="${getTarget(
            "intel"
        )}" rel="noreferrer" title="Open in Intel" href="https://intel.ingress.com/intel?ll=${lat},${lng}&z=21">${content}</a>`;

    const renderScores = ({ review }) => {
        if (!review || typeof review === "string" || !review.quality) {
            return "";
        }
        return `
        <table class="table table-condensed scores">
          <thead>
              <tr>
                  <th class="text-center">Score</th>
                  <th class="text-center">Title</th>
                  <th class="text-center">Cultural</th>
                  <th class="text-center">Unique</th>
                  <th class="text-center">Safety</th>
                  <th class="text-center">Location</th>
              </tr>
          </thead>
          <tbody class="review-list">
            <tr>
              <td class="text-center">${review.quality}</td>
              <td class="text-center">${review.description}</td>
              <td class="text-center">${review.cultural}</td>
              <td class="text-center">${review.uniqueness}</td>
              <td class="text-center">${review.safety}</td>
              <td class="text-center">${review.location}</td>
            </tr>
          </tbody>
        </table>
      `;
    };

    function getOpenInButton(lat, lng, title) {
        //Create main dropdown menu ("button")
        var mainButton = document.createElement("div");
        mainButton.setAttribute("class", "dropdown");

        var buttonText = document.createElement("span");
        buttonText.innerText = "Open in ...";

        var dropdownContainer = document.createElement("div");
        dropdownContainer.setAttribute("class", "dropdown-content");

        mainButton.appendChild(buttonText);
        mainButton.appendChild(dropdownContainer);

        dropdownContainer.innerHTML = null;

        var customMaps = JSON.parse(settings["customMaps"]);

        for (var i = 0; i < customMaps.length; i++) {
            var title = customMaps[i].title;
            var link = customMaps[i].url;

            //Link editing:
            link = link.replaceAll("%lat%", lat);
            link = link.replaceAll("%lng%", lng);
            link = link.replaceAll("%title%", title);

            var button = document.createElement("a");
            button.href = link;
            if (settings["keepTab"])
                button.setAttribute("target", getStringHash(customMaps[i].url));
            //On URL with placeholders as those are the same between different wayspots but not between different maps!
            else button.setAttribute("target", "_BLANK");
            button.innerText = title;
            dropdownContainer.appendChild(button);
        }

        if (customMaps.length === 0) {
            var emptySpan = document.createElement("span");
            emptySpan.innerText = "No custom maps set!";
            dropdownContainer.appendChild(emptySpan);
        }
        return mainButton;
    }

    //NON-SECURE (But good enough for uniqueID on URLs)
    function getStringHash(str) {
        var hash = 0;
        if (str.length === 0) {
            return hash;
        }
        for (var i = 0; i < str.length; i++) {
            var char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash;
    }

    const getL10N = () => {
        const i18n = JSON.parse(localStorage['@transloco/translations']);
        return i18n[Object.keys(i18n)[0]];
    }

    // Opens an IDB database connection.
    // IT IS YOUR RESPONSIBILITY TO CLOSE THE RETURNED DATABASE CONNECTION WHEN YOU ARE DONE WITH IT.
    // THIS FUNCTION DOES NOT DO THIS FOR YOU - YOU HAVE TO CALL db.close()!
    const getIDBInstance = version => new Promise((resolve, reject) => {
        'use strict';

        if (!window.indexedDB) {
            reject('This browser doesn\'t support IndexedDB!');
            return;
        }

        const openRequest = indexedDB.open('wayfarer-tools-db', version);
        openRequest.onsuccess = event => {
            const db = event.target.result;
            const dbVer = db.version;
            console.log(`IndexedDB initialization complete (database version ${dbVer}).`);
            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                db.close();
                console.log(`Database does not contain column ${OBJECT_STORE_NAME}. Closing and incrementing version.`);
                getIDBInstance(dbVer + 1).then(resolve);
            } else {
                resolve(db);
            }
        };
        openRequest.onupgradeneeded = event => {
            console.log('Upgrading database...');
            const db = event.target.result;
            if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                db.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'id' });
            }
        };
    });

    (() => {
      const css = `
              dt.bbold {
                font-weight: bold;
                color: #ff4713;
              }

              .dark dt.bbold {
                font-weight: bold;
                color: #20B8E3;
              }
              table.dataTable {
              clear: both;
              margin-top: 6px !important;
              margin-bottom: 6px !important;
              max-width: none !important;
              border-collapse: separate !important;
              }
              table.dataTable td,
              table.dataTable th {
                -webkit-box-sizing: content-box;
                box-sizing: content-box;
              }
              table.dataTable td.dataTables_empty,
              table.dataTable th.dataTables_empty {
                text-align: center;
              }
              table.dataTable.nowrap th,
              table.dataTable.nowrap td {
                white-space: nowrap;
              }

              div.dataTables_wrapper div.dataTables_length label {
                font-weight: normal;
                text-align: left;
                white-space: nowrap;
                color: #eee;
              }
              div.dataTables_wrapper div.dataTables_length select {
                width: 75px;
                display: inline-block;
              }
              div.dataTables_wrapper div.dataTables_filter {
                text-align: right;
              }
              div.dataTables_wrapper div.dataTables_filter label {
                font-weight: normal;
                white-space: nowrap;
                text-align: left;
                color: #eee;
              }
              div.dataTables_wrapper div.dataTables_filter input {
                margin-left: 0.5em;
                display: inline-block;
                width: auto;
              }
              div.dataTables_wrapper div.dataTables_info {
                padding-top: 8px;
                white-space: nowrap;
              }
              div.dataTables_wrapper div.dataTables_paginate {
                margin: 0;
                white-space: nowrap;
                text-align: right;
              }
              .dataTables_wrapper .dataTables_paginate .paginate_button {
                box-sizing: border-box;
                display: inline-block;
                min-width: 1.5em;
                padding: 0.5em 1em;
                margin-left: 2px;
                text-align: center;
                text-decoration: none !important;
                cursor: pointer;
                color: #eee !important;
                border: 1px solid transparent;
                border-radius: 2px;
              }
              .dataTables_wrapper .dataTables_paginate .paginate_button.current, .dataTables_wrapper .dataTables_paginate .paginate_button.current:hover {
                color: #eee !important;
                border: 1px solid rgba(0, 0, 0, 0.3);
                background-color: rgba(230, 230, 230, 0.1);
                background: -webkit-gradient(linear, left top, left bottom, color-stop(0%, rgba(230, 230, 230, 0.1)), color-stop(100%, rgba(0, 0, 0, 0.1)));
                /* Chrome,Safari4+ */
                background: -webkit-linear-gradient(top, rgba(230, 230, 230, 0.1) 0%, rgba(0, 0, 0, 0.1) 100%);
                /* Chrome10+,Safari5.1+ */
                background: -moz-linear-gradient(top, rgba(230, 230, 230, 0.1) 0%, rgba(0, 0, 0, 0.1) 100%);
                /* FF3.6+ */
                background: -ms-linear-gradient(top, rgba(230, 230, 230, 0.1) 0%, rgba(0, 0, 0, 0.1) 100%);
                /* IE10+ */
                background: -o-linear-gradient(top, rgba(230, 230, 230, 0.1) 0%, rgba(0, 0, 0, 0.1) 100%);
                /* Opera 11.10+ */
                background: linear-gradient(to bottom, rgba(230, 230, 230, 0.1) 0%, rgba(0, 0, 0, 0.1) 100%);
                /* W3C */
              }
              .dataTables_wrapper .dataTables_paginate .paginate_button.disabled, .dataTables_wrapper .dataTables_paginate .paginate_button.disabled:hover, .dataTables_wrapper .dataTables_paginate .paginate_button.disabled:active {
                cursor: default;
                color: #666 !important;
                border: 1px solid transparent;
                background: transparent;
                box-shadow: none;
              }
              .dataTables_wrapper .dataTables_paginate .paginate_button:hover {
                color: white !important;
                border: 1px solid #111111;
                background-color: #585858;
                background: -webkit-gradient(linear, left top, left bottom, color-stop(0%, #585858), color-stop(100%, #111111));
                /* Chrome,Safari4+ */
                background: -webkit-linear-gradient(top, #585858 0%, #111111 100%);
                /* Chrome10+,Safari5.1+ */
                background: -moz-linear-gradient(top, #585858 0%, #111111 100%);
                /* FF3.6+ */
                background: -ms-linear-gradient(top, #585858 0%, #111111 100%);
                /* IE10+ */
                background: -o-linear-gradient(top, #585858 0%, #111111 100%);
                /* Opera 11.10+ */
                background: linear-gradient(to bottom, #585858 0%, #111111 100%);
                /* W3C */
              }
              .dataTables_wrapper .dataTables_paginate .paginate_button:active {
                outline: none;
                background-color: #2b2b2b;
                background: -webkit-gradient(linear, left top, left bottom, color-stop(0%, #2b2b2b), color-stop(100%, #0c0c0c));
                /* Chrome,Safari4+ */
                background: -webkit-linear-gradient(top, #2b2b2b 0%, #0c0c0c 100%);
                /* Chrome10+,Safari5.1+ */
                background: -moz-linear-gradient(top, #2b2b2b 0%, #0c0c0c 100%);
                /* FF3.6+ */
                background: -ms-linear-gradient(top, #2b2b2b 0%, #0c0c0c 100%);
                /* IE10+ */
                background: -o-linear-gradient(top, #2b2b2b 0%, #0c0c0c 100%);
                /* Opera 11.10+ */
                background: linear-gradient(to bottom, #2b2b2b 0%, #0c0c0c 100%);
                /* W3C */
                box-shadow: inset 0 0 3px #111;
              }
              div.dataTables_wrapper div.dataTables_paginate ul.pagination {
                margin: 2px 0;
                white-space: nowrap;
              }
              div.dataTables_wrapper div.dataTables_processing {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 200px;
                margin-left: -100px;
                margin-top: -26px;
                text-align: center;
                padding: 1em 0;
              }

              table.dataTable thead > tr > th.sorting_asc, table.dataTable thead > tr > th.sorting_desc, table.dataTable thead > tr > th.sorting,
              table.dataTable thead > tr > td.sorting_asc,
              table.dataTable thead > tr > td.sorting_desc,
              table.dataTable thead > tr > td.sorting {
                padding-right: 30px;
              }
              table.dataTable thead > tr > th:active,
              table.dataTable thead > tr > td:active {
                outline: none;
              }
              table.dataTable thead .sorting,
              table.dataTable thead .sorting_asc,
              table.dataTable thead .sorting_desc,
              table.dataTable thead .sorting_asc_disabled,
              table.dataTable thead .sorting_desc_disabled {
                cursor: pointer;
                position: relative;
              }
              table.dataTable thead .sorting:after,
              table.dataTable thead .sorting_asc:after,
              table.dataTable thead .sorting_desc:after,
              table.dataTable thead .sorting_asc_disabled:after,
              table.dataTable thead .sorting_desc_disabled:after {
                position: absolute;
                bottom: 8px;
                right: 8px;
                display: block;
                font-family: 'Glyphicons Halflings';
                opacity: 0.5;
              }
              table.dataTable thead .sorting:after {
                opacity: 0.2;
                content: "\e150";
                /* sort */
              }
              table.dataTable thead .sorting_asc:after {
                content: "\e155";
                /* sort-by-attributes */
              }
              table.dataTable thead .sorting_desc:after {
                content: "\e156";
                /* sort-by-attributes-alt */
              }
              table.dataTable thead .sorting_asc_disabled:after,
              table.dataTable thead .sorting_desc_disabled:after {
                color: #eee;
              }

              div.dataTables_scrollHead table.dataTable {
                margin-bottom: 0 !important;
              }

              div.dataTables_scrollBody > table {
                border-top: none;
                margin-top: 0 !important;
                margin-bottom: 0 !important;
              }
              div.dataTables_scrollBody > table > thead .sorting:after,
              div.dataTables_scrollBody > table > thead .sorting_asc:after,
              div.dataTables_scrollBody > table > thead .sorting_desc:after {
                display: none;
              }
              div.dataTables_scrollBody > table > tbody > tr:first-child > th,
              div.dataTables_scrollBody > table > tbody > tr:first-child > td {
                border-top: none;
              }

              div.dataTables_scrollFoot > .dataTables_scrollFootInner {
                box-sizing: content-box;
              }
              div.dataTables_scrollFoot > .dataTables_scrollFootInner > table {
                margin-top: 0 !important;
                border-top: none;
              }

              @media screen and (max-width: 767px) {
                div.dataTables_wrapper div.dataTables_length,
                div.dataTables_wrapper div.dataTables_filter,
                div.dataTables_wrapper div.dataTables_info,
                div.dataTables_wrapper div.dataTables_paginate {
                  text-align: center;
                }
              }
              table.dataTable.table-condensed > thead > tr > th {
                padding-right: 20px;
              }
              table.dataTable.table-condensed .sorting:after,
              table.dataTable.table-condensed .sorting_asc:after,
              table.dataTable.table-condensed .sorting_desc:after {
                top: 6px;
                right: 6px;
              }

              table.table-bordered.dataTable th,
              table.table-bordered.dataTable td {
                border-left-width: 0;
              }
              table.table-bordered.dataTable th:last-child, table.table-bordered.dataTable th:last-child,
              table.table-bordered.dataTable td:last-child,
              table.table-bordered.dataTable td:last-child {
                border-right-width: 0;
              }
              table.table-bordered.dataTable tbody th,
              table.table-bordered.dataTable tbody td {
                border-bottom-width: 0;
              }

              div.dataTables_scrollHead table.table-bordered {
                border-bottom-width: 0;
              }

              div.table-responsive > div.dataTables_wrapper > div.row {
                margin: 0;
              }
              div.table-responsive > div.dataTables_wrapper > div.row > div[class^="col-"]:first-child {
                padding-left: 0;
              }
              div.table-responsive > div.dataTables_wrapper > div.row > div[class^="col-"]:last-child {
                padding-right: 0;
              }


              @keyframes dtb-spinner {
                100% {
                  transform: rotate(360deg);
                }
              }
              @-o-keyframes dtb-spinner {
                100% {
                  -o-transform: rotate(360deg);
                  transform: rotate(360deg);
                }
              }
              @-ms-keyframes dtb-spinner {
                100% {
                  -ms-transform: rotate(360deg);
                  transform: rotate(360deg);
                }
              }
              @-webkit-keyframes dtb-spinner {
                100% {
                  -webkit-transform: rotate(360deg);
                  transform: rotate(360deg);
                }
              }
              @-moz-keyframes dtb-spinner {
                100% {
                  -moz-transform: rotate(360deg);
                  transform: rotate(360deg);
                }
              }
              div.dt-button-info {
                position: fixed;
                top: 50%;
                left: 50%;
                width: 400px;
                margin-top: -100px;
                margin-left: -200px;
                background-color: white;
                border: 2px solid #111;
                box-shadow: 3px 3px 8px rgba(0, 0, 0, 0.3);
                border-radius: 3px;
                text-align: center;
                z-index: 21;
              }
              div.dt-button-info h2 {
                padding: 0.5em;
                margin: 0;
                font-weight: normal;
                border-bottom: 1px solid #ddd;
                background-color: #f3f3f3;
              }
              div.dt-button-info > div {
                padding: 1em;
              }

              div.dt-button-collection-title {
                text-align: center;
                padding: 0.3em 0 0.5em;
                font-size: 0.9em;
              }

              div.dt-button-collection-title:empty {
                display: none;
              }

              div.dt-button-collection {
                position: absolute;
              }
              div.dt-button-collection ul.dropdown-menu {
                display: block;
                z-index: 2002;
                min-width: 100%;
              }
              div.dt-button-collection div.dt-button-collection-title {
                background-color: white;
              }
              div.dt-button-collection.fixed {
                position: fixed;
                top: 50%;
                left: 50%;
                margin-left: -75px;
                border-radius: 0;
              }
              div.dt-button-collection.fixed.two-column {
                margin-left: -200px;
              }
              div.dt-button-collection.fixed.three-column {
                margin-left: -225px;
              }
              div.dt-button-collection.fixed.four-column {
                margin-left: -300px;
              }
              div.dt-button-collection > :last-child {
                display: block !important;
                -webkit-column-gap: 8px;
                -moz-column-gap: 8px;
                -ms-column-gap: 8px;
                -o-column-gap: 8px;
                column-gap: 8px;
              }
              div.dt-button-collection > :last-child > * {
                -webkit-column-break-inside: avoid;
                break-inside: avoid;
              }
              div.dt-button-collection.two-column {
                width: 400px;
              }
              div.dt-button-collection.two-column > :last-child {
                padding-bottom: 1px;
                -webkit-column-count: 2;
                -moz-column-count: 2;
                -ms-column-count: 2;
                -o-column-count: 2;
                column-count: 2;
              }
              div.dt-button-collection.three-column {
                width: 450px;
              }
              div.dt-button-collection.three-column > :last-child {
                padding-bottom: 1px;
                -webkit-column-count: 3;
                -moz-column-count: 3;
                -ms-column-count: 3;
                -o-column-count: 3;
                column-count: 3;
              }
              div.dt-button-collection.four-column {
                width: 600px;
              }
              div.dt-button-collection.four-column > :last-child {
                padding-bottom: 1px;
                -webkit-column-count: 4;
                -moz-column-count: 4;
                -ms-column-count: 4;
                -o-column-count: 4;
                column-count: 4;
              }
              div.dt-button-collection .dt-button {
                border-radius: 0;
              }

              div.dt-button-background {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 2001;
              }

              @media screen and (max-width: 767px) {
                div.dt-buttons {
                  float: none;
                  width: 100%;
                  text-align: center;
                  margin-bottom: 0.5em;
                }
                div.dt-buttons a.btn {
                  float: none;
                }
              }
              div.dt-buttons button.btn.processing,
              div.dt-buttons div.btn.processing,
              div.dt-buttons a.btn.processing {
                color: rgba(0, 0, 0, 0.2);
              }
              div.dt-buttons button.btn.processing:after,
              div.dt-buttons div.btn.processing:after,
              div.dt-buttons a.btn.processing:after {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 16px;
                height: 16px;
                margin: -8px 0 0 -8px;
                box-sizing: border-box;
                display: block;
                content: ' ';
                border: 2px solid #282828;
                border-radius: 50%;
                border-left-color: transparent;
                border-right-color: transparent;
                animation: dtb-spinner 1500ms infinite linear;
                -o-animation: dtb-spinner 1500ms infinite linear;
                -ms-animation: dtb-spinner 1500ms infinite linear;
                -webkit-animation: dtb-spinner 1500ms infinite linear;
                -moz-animation: dtb-spinner 1500ms infinite linear;
              }


              div.dts {
                display: block !important;
              }
              div.dts tbody th,
              div.dts tbody td {
                white-space: nowrap;
              }
              div.dts div.dts_loading {
                z-index: 1;
              }
              div.dts div.dts_label {
                position: absolute;
                right: 10px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                box-shadow: 3px 3px 10px rgba(0, 0, 0, 0.5);
                text-align: right;
                border-radius: 3px;
                padding: 0.4em;
                z-index: 2;
                display: none;
              }
              div.dts div.dataTables_scrollBody {
                background: repeating-linear-gradient(45deg, #edeeff, #edeeff 10px, white 10px, white 20px);
              }
              div.dts div.dataTables_scrollBody table {
                z-index: 2;
              }
              div.dts div.dataTables_paginate,
              div.dts div.dataTables_length {
                display: none;
              }

              div.DTS tbody tr {
                background-color: white;
              }

              .review-details {
                white-space: normal !important;
              }

              #ProfileController .gm-style .gm-style-iw-c, #ProfileController .gm-style .gm-style-iw-d {
                max-height: none !important;
              }

              .row-input {
                margin-top: 20px;
                margin-bottom: 20px;

              }

              .review-actions .toggle-details {
                position: relative;
                padding-left: 25px;
              }

              .review-actions .toggle-details::before {
                top: 0;
                left: 0;
                height: 18px;
                width: 18px;
                display: block;
                position: absolute;
                color: white;
                border: 2px solid white;
                border-radius: 50%;
                box-shadow: 0 0 3px #444;
                text-align: center;
                font-family: 'Courier New', Courier, monospace;
                line-height: 100%;
                content: '+';
                background-color: #31b131;
              }

              .shown .review-actions .toggle-details::before {
                content: '-';
                background-color: #d33333;
              }`;
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
