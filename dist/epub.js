"use strict";

/*******************************************************************************
 * Copyright (c) 2011, Adobe Systems Incorporated
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * ·        Redistributions of source code must retain the above copyright
 *          notice, this list of conditions and the following disclaimer.
 *
 * ·        Redistributions in binary form must reproduce the above copyright
 *		   notice, this list of conditions and the following disclaimer in the
 *		   documentation and/or other materials provided with the distribution.
 *
 * ·        Neither the name of Adobe Systems Incorporated nor the names of its
 *		   contributors may be used to endorse or promote products derived from
 *		   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS
 * OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *******************************************************************************/

// Note: this is a prototype implementation that does not do complete parsing/processing
// of CFI. You WOULD need to tighten and test it before using for production purposes.

function log(error) {
	if (error && window.console && window.console.log) window.console.log(error);
}

function encodeCFI(doc, node, offset, tail) {
	var cfi = tail || "";

	// handle offset
	switch (node.nodeType) {
		case 1:
			if (typeof offset == "number") node = node.childNodes.item(offset);
			break;
		default:
			offset = offset || 0;
			while (true) {
				var p = node.previousSibling;
				if (!p || p.nodeType == 1) break;
				switch (p.nodeType) {
					case 3:
					case 4:
					case 5:
						offset += p.nodeValue.length;
				}
				node = p;
			}
			cfi = ":" + offset + cfi;
			break;
	}

	// go up the tree
	while (node !== doc) {
		var parent = node.parentNode;
		if (!parent) {
			if (node.nodeType == 9) {
				var win = node.defaultView;
				if (win.frameElement) {
					node = win.frameElement;
					cfi = "!" + cfi;
					continue;
				}
			}
			break;
		}
		var index = 0;
		var child = parent.firstChild;
		while (true) {
			index |= 1;
			if (child.nodeType == 1) index++;
			if (child === node) break;
			child = child.nextSibling;
		}
		if (node.id && node.id.match(/^[-a-zA-Z_0-9.\u007F-\uFFFF]+$/)) index = index + "[" + node.id + "]";
		cfi = "/" + index + cfi;
		node = parent;
	}
	// we stop at BODY_HOLDER_ID so +'/4' for body tag in orgin html
	// outside file manage by epub nav
	return cfi;
}

function decodeCFI(doc, cfi) {
	var node = doc;
	var error;
	var r;
	var breakwatch = 0;
	while (cfi.length > 0 || error) {
		// some condition, never break out the loop !
		if (breakwatch == 100) {
			break;
		}
		breakwatch++;

		if ((r = cfi.match(/^\/(\d+)(\[([-a-zA-Z_0-9.\u007F-\uFFFF]+)\])?/)) !== null) {
			var targetIndex = r[1] - 0;
			var id = r[3];
			var index = 0;
			var child = node.firstChild;
			while (true) {
				if (!child) {
					error = "child not found: " + cfi;
					break;
				}
				index |= 1;
				if (child.nodeType === 1) index++;
				if (index === targetIndex) {
					cfi = cfi.substr(r[0].length);
					node = child;
					if (id ? node.id != id : node.id) {
						log("id mismatch: '" + id + "' and '" + node.id + "'");
						// TODO: recover? try both possibilities: starting with id and start
						// with the child with the given index and see if we get resolution
						// without error
					}
					break;
				}
				child = child.nextSibling;
			}
		} else if ((r = cfi.match(/^!/)) !== null) {
			if (node.contentDocument) {
				node = node.contentDocument;
				cfi = cfi.substr(1);
			} else error = "Cannot reference " + node.nodeName + "'s content: " + cfi;
		} else {
			break;
		}
	}

	var offset = null;
	var point = {};

	if ((r = cfi.match(/^:(\d+)/)) !== null) {
		offset = r[1] - 0;
		cfi = cfi.substr(r[0].length);
	}
	if ((r = cfi.match(/^~(-?\d+(\.\d+)?)/)) !== null) {
		point.time = r[1] - 0;
		cfi = cfi.substr(r[0].length);
	}
	if ((r = cfi.match(/^@(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)/)) !== null) {
		point.x = r[1] - 0;
		point.y = r[3] - 0;
		cfi = cfi.substr(r[0].length);
	}
	if ((r = cfi.match(/^\[.*(;s=[ab])?.*\]/)) !== null) // pretty lame
		{
			if (r[1]) {
				point.forward = r[0] == "s=a";
				cfi = cfi.substr(1);
			}
		}

	// find correct text node
	if (offset !== null) {
		while (true) {
			var len = node.nodeValue.length;
			if (offset < len || !point.forward && offset === len) break;
			var next = node.nextSibling;
			while (true) {
				var type = next.nodeType;
				if (type === 3 || type === 4 || type === 5) break;
				if (type == 1) {
					next = null;
					break;
				}
				next = next.nextSibling;
			}
			if (!next) {
				if (offset > len) {
					error = "Offset out of range: " + offset;
					offset = len;
				}
				break;
			}
			node = next;
			offset -= len;
		}
		point.offset = offset;
	}

	point.node = node;
	if (error) point.error = error;else if (cfi.length > 0) point.error = "Undecoded: " + cfi;

	log(point.error);

	return point;
}

function fstr(d) {
	var s = "";
	if (d < 0) {
		s = "-";
		d = -d;
	}
	var n = Math.floor(d);
	s += n;
	n = Math.round((d - n) * 100);
	if (n !== 0) {
		s += ".";
		if (n % 10 == 0) s += n / 10;else s += n;
	}
	return s;
}

function cfiAt(doc, e) //x, y)
{
	var target;
	var cdoc = document;
	var cwin = cdoc.defaultView;
	var tail = "";
	var offset = null;
	var name;

	var x = e.x;
	var y = e.y;

	while (true) {
		target = cdoc.elementFromPoint(x, y);

		if (!target) {
			log("no element at point");
			return null;
		}

		name = target.localName;
		if (name != "iframe" && name != "object" && name != "embed") break;

		// drill into object
		var cd = target.contentDocument;
		if (!cd) break;

		x = x + cwin.scrollX - target.offsetLeft;
		y = y + cwin.scrollY - target.offsetTop;
		cdoc = cd;
		cwin = cdoc.defaultView;
	}

	if (name == "video" || name == "audio") {
		tail = "~" + fstr(target.currentTime);
	}
	if (name == "img" || name == "video") {
		var px = (x + cwin.scrollX - target.offsetLeft) * 100 / target.offsetWidth;
		var py = (y + cwin.scrollY - target.offsetTop) * 100 / target.offsetHeight;
		tail = tail + "@" + fstr(px) + "," + fstr(py);
	} else if (name != "audio") {
		if (cdoc.caretRangeFromPoint) {
			var range = cdoc.caretRangeFromPoint(x, y);
			if (range) {
				target = range.startContainer;
				offset = range.startOffset;
			}
		}
	}
	return encodeCFI(doc, target, offset, tail);
}

function pointFromCFI(doc, cfi) {
	var r = decodeCFI(doc, cfi);
	if (!r) return null;
	var node = r.node;
	var ndoc = node.ownerDocument;
	if (!ndoc) {
		log("document");
		return null;
	}
	var nwin = ndoc.defaultView;
	var x;
	var y;
	if (typeof r.offset == "number") {
		var range = ndoc.createRange();
		if (r.forward) tryList = [{ start: 0, end: 0, a: 0.5 }, { start: 0, end: 1, a: 1 }, { start: -1, end: 0, a: 0 }];else tryList = [{ start: 0, end: 0, a: 0.5 }, { start: -1, end: 0, a: 0 }, { start: 0, end: 1, a: 1 }];
		var k = 0;
		var a;
		var nodeLen = node.nodeValue.length;
		do {
			if (k >= tryList.length) {
				log("no caret position: " + rects);
				return null;
			}
			var t = tryList[k++];
			var startOffset = r.offset + t.start;
			var endOffset = r.offset + t.end;
			a = t.a;
			if (startOffset < 0 || endOffset >= nodeLen) continue;
			//log("trying " + startOffset + ":" + endOffset );
			range.setStart(node, startOffset);
			range.setEnd(node, endOffset);
			rects = range.getClientRects();
		} while (!rects || !rects.length);
		var rect = rects[0];
		x = a * rect.left + (1 - a) * rect.right;
		y = (rect.top + rect.bottom) / 2;
	} else {
		x = node.offsetLeft - nwin.scrollX;
		y = node.offsetTop - nwin.scrollY;
		if (typeof r.x == "number" && node.offsetWidth) {
			x += r.x * node.offsetWidth / 100;
			y += r.y * node.offsetHeight / 100;
		}
	}
	while (ndoc != doc) {
		node = nwin.frameElement;
		ndoc = node.ownerDocument;
		nwin = ndoc.defaultView;
		x += node.offsetLeft - nwin.scrollX;
		y += node.offsetTop - nwin.scrollY;
	}
	return { x: x, y: y, node: r.node, time: r.time };
}

//----------- Test code --------------

function setCurrentTime(node, time) {
	if (node.currentTime === undefined) return;
	if (node.readyState == 4) node.currentTime = time;else {
		node.addEventListener("canplay", function () {
			node.currentTime = time;
		}, false);
	}
}

function showCFI(dontSeek) {
	if (window.cfi) {
		var pos = pointFromCFI(document, window.cfi);
		var ms = document.getElementById("marker").style;
		if (pos) {
			ms.visibility = "visible";
			ms.top = pos.y - 30 + window.scrollY + "px";
			ms.left = pos.x - 1 + window.scrollX + "px";
			if (!dontSeek) {
				if (typeof pos.time == "number") setCurrentTime(pos.node, pos.time);
				scrollTo(0, pos.y - 30);
			}
		}
	}
}

function markAndReload(view, evt) {
	view = view || document;
	window.cfi = cfiAt(view, evt); //.clientX, evt.clientY );
	console.log(window.cfi);
	// http://stackoverflow.com/questions/8813051/determine-which-element-the-mouse-pointer-is-on-top-of-in-javascript
	// showCFI(true);
	// if( window.cfi )
	// {
	//     setTimeout( function() {
	//         location.replace( location.href.replace(/#.*$/,'') + "#epubcfi(" + window.cfi + ")" );
	//     }, 1000 );
	// }
}

function hookAndScroll() {
	window.onscroll = showCFI;
	window.onresize = showCFI;
	var iframes = document.getElementsByTagName("iframe");
	for (var k = 0; k < iframes.length; k++) {
		var iframe = iframes.item(k);
		iframe.contentWindow.onscroll = showCFI;
	}
	var r = location.hash.match(/#epubcfi\((.*)\)$/);
	if (r) {
		window.cfi = decodeURI(r[1]);
		setTimeout(showCFI, 10);
	}
}
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

function parse(xml) {
    if (window.DOMParser) {
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(xml, "text/xml");
    } else {
        var xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async = false;
        xmlDoc.loadXML(xml);
    }
    return xmlDoc;
}

// Changes XML to JSON
// https://davidwalsh.name/convert-xml-json
function xmlToJson(xml) {
    // Create the return object
    var obj = {};

    if (xml.nodeType == 1) {
        // element
        // do attributes
        if (xml.attributes.length > 0) {
            obj["@attributes"] = {};
            for (var j = 0; j < xml.attributes.length; j++) {
                var attribute = xml.attributes.item(j);
                obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
            }
        }
    } else if (xml.nodeType == 3) {
        // text
        obj = xml.nodeValue.trim();
    }

    // do children
    if (xml.hasChildNodes()) {
        for (var i = 0; i < xml.childNodes.length; i++) {
            var item = xml.childNodes.item(i);
            var nodeName = item.nodeName;
            if (typeof obj[nodeName] == "undefined") {
                //var o = xmlToJson(item);
                //if (typeof(o) ==="object")
                obj[nodeName] = xmlToJson(item);
            } else {
                if (typeof obj[nodeName].push == "undefined") {
                    var old = obj[nodeName];
                    obj[nodeName] = [];
                    obj[nodeName].push(old);
                }
                // empty object
                var o = xmlToJson(item);
                if ((typeof o === "undefined" ? "undefined" : _typeof(o)) === "object") obj[nodeName].push(o);
            }
        }
    }
    return obj;
};

/**
 * navigation control class
 * [nav item]
 */
function Nav() {
    this.chapterIndex = 0;

    this.setPage = function (page) {
        this.page = page;
    };

    /**
     * navpoints
     *   navpoint   -> html
     *   navpoint   -> html
     *   navpoint   -> html
     *   ....       -> html
     */
    this.setToc = function (toc) {
        var jtoc = xmlToJson(toc);
        this.toc = jtoc;
        // this.extractHtmlFiles();
    };

    this.setOpf = function (opf) {
        this.opf = xmlToJson(opf);
        this.setSpinesSource();
    };

    this.navPoints = function () {
        if (!this._navPoints) {
            var ncx = this.toc['ncx'];
            var navMap = null;
            if (Array.isArray(ncx)) {
                for (var ncxIndex in ncx) {
                    if (ncx[ncxIndex]['navMap']) {
                        navMap = ncx[ncxIndex]['navMap']['navPoint'];
                        break;
                    }
                }
            } else {
                navMap = ncx['navMap']['navPoint'];
            }
            this._navPoints = navMap;
        }

        return this._navPoints;
    };

    /**
     * link spines to html files source
     */
    this.setSpinesSource = function (params) {
        var spineList = this.opf.package.spine.itemref;
        var manifestList = this.opf.package.manifest.item;

        var i,
            idref,
            l = spineList.length;
        var manifestLen = manifestList.length;

        for (i = 0; i < l; i++) {
            var s = spineList[i];
            idref = s['@attributes']['idref'];
            var j;
            for (j = 0; j < manifestLen; j++) {
                var m = manifestList[j];
                if (m['@attributes']['id'] == idref) {
                    s['src'] = m['@attributes']['href'];
                    break;
                }
            }
        }
        this.spines = spineList;
    };

    /**
     * update chapterIndex then
     * return true if change index
     * else return false
     */
    this.setIndexFromSource = function (source) {
        for (var i = this.spines.length - 1; i >= 0; i -= 1) {
            if (this.spines[i]['src'] == source) {
                if (this.chapterIndex == i) {
                    return false;
                }
                this.chapterIndex = i;
                return true;
            }
        }
        throw new Error("source not found :" + source);
    };

    /**
     * spine list
     */
    // this.spines = function () {
    //     return this.opf.package.spine.itemref;
    // }

    /**
     * navPoint --> html <-- spine
     */
    this.extractHtmlFiles = function () {
        var rootPoints = this.navPoints();
        var files = [];

        function getNavFile(n) {
            // Text/calibre_quick_start_split_007.xhtml#task2.2
            var file = n['content']['@attributes']['src'],
                hash = file.indexOf('#');
            if (hash !== -1) {
                file = file.substr(0, hash);
            }
            return file;
        }

        function getNavFiles(navPoints) {
            var i,
                l = navPoints.length;
            for (i = 0; i < l; i++) {
                var n = navPoints[i];
                var fname = getNavFile(n);
                var last = files[files.length - 1];
                if (last !== fname) {
                    files.push(fname);
                }
                if (n['navPoint']) {
                    getNavFiles(n['navPoint']);
                }
            }
        }
        getNavFiles(rootPoints);
        this.htmlFiles = files;
    };

    this.gotoIndex = function (index) {
        var inorder = index;
        switch (index) {
            case 'next':
                inorder = this.chapterIndex + 1;
                break;
            case 'back':
                inorder = this.chapterIndex - 1;
                break;
            case 'first':
                inorder = 0;
                break;
            default:
                inorder = index;
                break;
        }

        try {
            inorder = parseInt(inorder);
        } catch (error) {
            throw new Error("play order must in number");
        }

        if (inorder < 0 || inorder >= this.spines.length) {
            throw new Error("play order out of range : " + inorder);
        }

        this.chapterIndex = inorder;
        // var e = navList[inorder];
        var src = this.spines[this.chapterIndex]['src'];
        return src;
    };

    this.gotoPage = function (page) {
        switch (page) {
            case 'next':
                if (this.page.current >= this.page.total) {
                    return false;
                } else {
                    this.page.current += 1;
                }
                break;
            case 'back':
                if (this.page.current <= 0) {
                    return false;
                } else {
                    this.page.current -= 1;
                }
                break;
            case 'last':
                this.page.current = this.page.total;
                break;
            default:
                /* goto numner */
                try {
                    page = parseInt(page);
                    if (page < 0 || page > this.page.total) {
                        return new Error('page out of range ' + page);
                    }
                    this.page.current = page;
                } catch (error) {
                    return error;
                }
                break;
        }
    };

    /**
     * current html file to CFI
     * cfi pre = /6(spine) + index of spine item
     * [          package.opf     ]   [ toc.ncx  ]   [package.opf]
     * spine.idref --> manifest.id -->navPoint.id => manifest.href
     */
    this.toCFI = function () {

        // /* toc.ncx => id */
        // var navList = this.navPoints();
        // var currFile = this.spines[this.chapterIndex].src;
        // var e = navList[this.chapterIndex];
        // var id = e['@attributes']['id'];// ['content']['@attributes']['src'];

        // /* id => spine index */
        // var spine = this.opf.package.spine.itemref;

        // var i = 0, found = false;
        // for(i = 0; i < spine.length; i++){
        //     var s = spine[i];
        //     if (s['@attributes']['idref'] === id){
        //         found = true;
        //         break;
        //     }
        // }

        // if (!found){
        //     // some epub reply with playorder
        //     i = e['@attributes']['playOrder'] - 1; //? playorder start with 1 but  spine start 0
        //     //throw new Error('spince not found for chapter')
        // }
        /**
         * /6 = spine
         * /(i+1)*2 = index of spine item
         * !/4 = body tag of document
         */
        return '/6/' + (this.chapterIndex + 1) * 2 + '!/4';
    };

    this.cfiToChapter = function (cfi) {
        // cfi in format '/6/(i+1)*2!/4'
        // cfi in format '/6/x*2!/4'
        var r = cfi.match(/^\/6\/(\d+)(\[([-a-zA-Z_0-9.\u007F-\uFFFF]+)\])?/);
        var targetIndex = r[1] - 0;
        var index = targetIndex / 2 - 1; // position on spine
        return this.gotoIndex(index);
        //var src = this.spines
        // var spineList = this.opf.package.spine.itemref;
        // if(!spineList[index]){
        //     // remove last view
        //     throw Error("index out of range: " + index);
        // }
        // var idref = spineList[index]['@attributes']['idref'];

        // // step 2. find idref in toc
        // var i = 0, found = false;
        // // epub 2
        // if (!spineList[index]['@attributes']['linear'] ||
        //      spineList[index]['@attributes']['linear'] !== 'yes'){

        //      i = index;
        //      found = true;
        // }
        // else{
        //     var navList = this.getNavMap()['navPoint'];
        //     for(i = 0; i < navList.length; i++){
        //         var item = navList[i];
        //         if (item['@attributes']['id'] === idref){
        //             found = true;
        //             break;
        //         }
        //     }
        // }
        // if (!found){
        //     throw new Error('idref not found ' + idref);
        // }
        //return this.gotoChapter(i);
    };
}

// this.getNavMap =function(){
//     if (!this.navMap){
//         var ncx = this.toc['ncx'];
//         var navMap = null;
//         if (Array.isArray(ncx)){
//             for(var ncxIndex in ncx){
//                 if (ncx[ncxIndex]['navMap']){
//                     navMap = ncx[ncxIndex]['navMap'];
//                     break;
//                 }
//             }
//         }
//         else{
//             navMap = ncx['navMap'];
//         }
//         this.navMap = navMap;
//     }

//     return this.navMap;
// }
// https://raw.githubusercontent.com/IDPF/epub-revision/master/src/samples/cfi/epubcfi.js
//http://stackoverflow.com/questions/16792578/how-to-create-a-epub-annotation-with-save-option-within-the-epub
//http://matt.garrish.ca/2013/03/navigating-cfis-part-1/
//http://matt.garrish.ca/2013/03/navigating-cfis-part-1/
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var BODY_HOLDER_ID = '__epub_body__';

var Epub = function () {
    /**
     * contruction
     * path = /books/moby-dick/
     * path = /books/moby-dick.epub
     * container.xml -> package.opf -> toc.ncx
     *                   index files   index
     */
    function Epub(path, http, options) {
        _classCallCheck(this, Epub);

        var optDefault = {
            view: null,
            toc: null,
            saveLastView: true,
            folder: true };
        window.$http = http;
        for (var k in optDefault) {
            if (!options[k]) {
                options[k] = optDefault[k];
            }
        }
        this.path = path;
        this.options = options;
        if (this.options.folder && this.path[this.path.length - 1] !== '/') this.path += '/';
        this.myRenderToc.bind(this);
        this.nav = new Nav(); // navigation
        this.epub = {}; // some epub information
    }

    /**
     * render to element
     */


    _createClass(Epub, [{
        key: 'renderView',
        value: function renderView(view) {
            this.view = view;
            this.showChapterByIndex('first');
            var me = this;
            this.view.onclick = function (evt) {
                var body = document.getElementById(BODY_HOLDER_ID);
                var cfi = cfiAt(body, evt);
                window.location.hash = 'epubcfi(' + me.nav.toCFI() + cfi + ')';
                //
            };
        }
    }, {
        key: 'uid',
        value: function uid() {
            if (!this.epub.uid) {
                var iden = this.nav.opf['package']['@attributes']['unique-identifier'];
                var meta = this.nav.opf['package']['metadata'];
                for (var k in meta) {
                    var elm = meta[k];

                    if (Array.isArray(elm)) {
                        var len = elm.length;
                        for (var i = 0; i < len; i++) {
                            var e = elm[i];
                            if (e['@attributes']) {
                                if (e['@attributes']['id'] === iden) {
                                    this.epub.uid = e['#text'];
                                    return this.epub.uid;
                                }
                            }
                        }
                    } else {
                        var a;
                        if (a = elm['@attributes']) {
                            if (a['id'] === iden) {
                                this.epub.uid = elm['#text'];
                                return this.epub.uid;
                            }
                        }
                    }
                }
            }

            return this.epub.uid;
        }

        /**
         * get first visible element in cfi
         */

    }, {
        key: 'firstVisiableElm',
        value: function firstVisiableElm() {
            var body = document.getElementById(BODY_HOLDER_ID);
            var evt = {
                x: body.offsetLeft,
                y: body.offsetTop
            };

            var posCfi = cfiAt(body, evt);
            // console.log(cfiat);
            return this.epubCfi(posCfi);
        }

        /**
         * epub cfi = navCfi + posCfi
         */

    }, {
        key: 'epubCfi',
        value: function epubCfi(posCfi) {
            return 'epubcfi(' + this.nav.toCFI() + posCfi + ')';
        }
    }, {
        key: 'gotoCfi',
        value: function gotoCfi(cfi) {
            var me = this;
            function toCfiPos() {
                var r;
                if (r = cfi.match(/!\/4.*/)) {
                    var cfi2 = r[0].substr(r[0].indexOf('/', 2));
                    var body = document.getElementById(BODY_HOLDER_ID);
                    var point = decodeCFI(body, cfi2);
                    console.log(point);
                    me.gotoElm(point.node);
                }
            }
            ///var src = this.nav.cfiToChapter(cfi);
            var src = this.nav.cfiToChapter(cfi);
            return this.readHtml(src).then(toCfiPos);
        }

        /**
         * default render handle
         */

    }, {
        key: 'renderToc',
        value: function renderToc(elm, handle) {
            if (!handle) {
                this.myRenderToc(elm);
            } else {
                handle(elm);
            }
        }
    }, {
        key: 'tocAsJson',
        value: function tocAsJson() {
            if (!this.tocJson) {
                this.tocJson = xmlToJson(this.toc);
            }
            return this.tocJson;
        }
    }, {
        key: 'opfAsJson',
        value: function opfAsJson() {
            if (!this.opfJson) {
                this.opfJson = xmlToJson(this.opf);
            }
            return this.opfJson;
        }
    }, {
        key: 'getFile',
        value: function getFile(path) {
            return path.split('#');
        }
    }, {
        key: 'myRenderToc',
        value: function myRenderToc(elm) {
            var navMap = this.nav.navPoints();
            var me = this;
            var index = 0;

            function makeToc(navMap) {
                var ul = document.createElement("ul");

                navMap.forEach(function (e) {
                    var li = document.createElement("li");
                    var a = document.createElement("a");
                    a.innerText = e.navLabel.text['#text'];
                    a.setAttribute('href', '#');
                    a.setAttribute('src', e['content']['@attributes']['src']);
                    a.setAttribute('id', e['@attributes']['id']);
                    a.onclick = function (e) {
                        function goElm(hash) {
                            var b = document.getElementById(BODY_HOLDER_ID);
                            var seekElm = b.querySelector("[id='" + hash + "']") || b.querySelector('[name="' + hash + ']"');
                            if (seekElm) {
                                me.gotoElm(seekElm);
                            }
                        }
                        var path = this.getAttribute('src');
                        path = path.split('#');

                        var next = me.nav.setIndexFromSource(path[0]);
                        if (next == true) {
                            me.readHtml(path[0]).then(function () {
                                // seek to element
                                if (path.length > 1) {
                                    goElm(path[1]);
                                }
                            });
                        } else {
                            if (path.length > 1) {
                                goElm(path[1]);
                            } else {
                                // goto first page
                                me.gotoPage(0);
                            }
                        }
                    };
                    li.appendChild(a);
                    ul.appendChild(li);
                    if (e['navPoint']) {
                        var childToc = makeToc(e['navPoint']);
                        li.appendChild(childToc);
                    }
                });
                return ul;
            }

            var toc = makeToc(navMap);
            elm.appendChild(toc);
            return this;
        }
    }, {
        key: 'calcPages',
        value: function calcPages() {
            var scrollWidth = this.view.scrollWidth,
                containerW = this.view.offsetWidth,
                total = Math.ceil(scrollWidth / containerW) - 1; // start at 0
            var page = {
                current: 0,
                total: total,
                width: this.view.offsetWidth
            };
            this.nav.setPage(page);

            this.view.scrollLeft = 0;

            if (scrollWidth % containerW !== 0) {
                var frag = document.createDocumentFragment();
                var p = document.createElement("p");
                p.innerHTML = '&nbsp';
                p.style.height = "99%";

                frag.appendChild(p);
                this.view.appendChild(frag);
            }
        }
    }, {
        key: 'gotoPage',
        value: function gotoPage(page) {
            var inpage = page;
            switch (page) {
                case 'next':
                    if (this.nav.gotoPage('next') == false) {
                        this.showChapterByIndex('next');
                        return;
                    }
                    break;
                case 'back':
                    if (this.nav.gotoPage('back') === false) {
                        var me = this;
                        this.showChapterByIndex('back').then(function () {
                            me.gotoPage('last');
                        });
                        return;
                    }
                    break;
                case 'last':
                    this.nav.gotoPage('last');
                    //this.page.current = this.page.total;
                    break;
                default:
                    this.nav.gotoPage(page);
                    break;
            }

            var w = this.view.offsetWidth;
            // goto page
            //this.view.scrollLeft = this.page.current*(w);
            this.view.scrollLeft = this.nav.page.current * w;
        }
    }, {
        key: 'gotoElm',
        value: function gotoElm(elm) {
            if (!elm) return;
            var rect = elm.getBoundingClientRect ? elm.getBoundingClientRect() : elm.parentElement.getBoundingClientRect();

            // var page = 0;
            // var left= 0;
            // var curr = this.nav.page.current;
            //     -w   0  +w
            // +--+--+--+--+
            // |  |  |  |  |
            // +--+--+--+--+

            // prev
            if (rect.left < 0) {
                var w = -1 * this.view.offsetWidth;
                //if (rect.left >= w) return;
                var page = Math.ceil(rect.left / w);
                var toPage = this.nav.page.current - page;
                if (toPage < 0) toPage = 0;
                this.gotoPage(toPage);
            } else {
                // forward
                var w = this.view.offsetWidth;
                if (rect.left <= w) return;
                var page = Math.ceil(rect.left / w);
                var toPage = this.nav.page.current + page - 1;
                if (toPage > this.nav.page.total) toPage = this.nav.page.total;
                this.gotoPage(toPage);
            }
            // while (page <= this.nav.page.total) {
            //     // elm.left > view.left && elm.left < view.left + this.view.offsetWidth;
            //     if (rect.left >= left && rect.left < left + w){
            //         this.gotoPage(page);
            //         break;
            //     }
            //     page ++;
            //     left = page*w;
            // }
        }

        /**
         * toc playorder = 1,2,3...
         * Params:
         * order = 'next' / 'back', 'first' or number,
         * cb = do affter load chapter complete (aync ?)
         */

    }, {
        key: 'showChapterByIndex',
        value: function showChapterByIndex(index, cb) {
            var src = this.nav.gotoIndex(index);
            //this.nav.pagePreCif();
            return this.readHtml(src);
        }
    }, {
        key: '_processContent',
        value: function _processContent(content) {
            var contentDom = parse(content);
            var css = contentDom.querySelectorAll('link[type="text/css"]');
            for (var i = 0; i < css.length; i++) {
                var e = css[i];
                var href = e.getAttribute('href').replace("..", "");
                href = this.bookPath + href;
                e.setAttribute('href', href.replace("//", "/"));
            }
            var img = contentDom.querySelectorAll('img');
            for (var _i = 0; _i < img.length; _i++) {
                var _e = img[_i];
                var src = _e.getAttribute('src').replace("..", "");
                src = this.bookPath + src;

                _e.setAttribute('src', src.replace("//", "/"));
            }
            // html file display on div : all head + body will remove
            // we create wrapper to handle body element
            var wrapBody = document.createElement('div');
            wrapBody.setAttribute("id", BODY_HOLDER_ID);
            var body = contentDom.body ? contentDom.body : contentDom.getElementsByTagName('body')[0];
            while (body.firstChild) {
                wrapBody.appendChild(body.firstChild);
            }
            body.appendChild(wrapBody);

            return contentDom;
        }
    }, {
        key: 'readHtml',
        value: function readHtml(url, view) {
            //let path = this.bookPath + url;
            var me = this;
            view = view || this.view;
            //var v = view;
            function show(resp) {
                var content = me._processContent(resp);
                var t = new XMLSerializer().serializeToString(content.documentElement);
                view.innerHTML = t;
                me.calcPages();
                me.dom = content;
            }
            return this.get(url).then(show);
            //return http.get(path).then(show);
        }

        /**
         * get from http or zip file
         */

    }, {
        key: 'get',
        value: function get(path, bookPath) {
            // if (!window.$http)
            //     window.$http = axios;

            if (bookPath !== false) bookPath = true;
            // remove some hash  # of path
            var hash = path.indexOf('#');
            if (hash !== -1) {
                path = path.substr(0, hash);
            }
            // first time is no bookPath
            var fpath = bookPath ? this.bookPath + path : path;

            if (this.options.folder) {
                return $http.get(fpath).then(function (resp) {
                    return resp.data;
                });
            }

            return this.zip.file(fpath).async('string');
        }

        /**
         * .epub file package in zip format
         */

    }, {
        key: 'initZip',
        value: function initZip(path) {
            var me = this;
            return $http.get(path, { responseType: "arraybuffer" }).then(function (resp, err) {
                var zip = new JSZip();
                return zip.loadAsync(resp.data).then(function (zip) {
                    // zip.forEach(function (relativePath, zipEntry) {
                    //     console.log(zipEntry.name);
                    // });
                    me.zip = zip;
                    return zip;
                }, function (e) {
                    throw e;
                });
            });
        }
    }, {
        key: 'init',
        value: function init() {
            var me = this;

            function getTocPath(xml) {
                var node = xml.querySelector("item[media-type='application/x-dtbncx+xml']");
                // If we can't find the toc by media-type then try to look for id of the item in the spine attributes as
                // according to http://www.idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.4.1.2,
                // "The item that describes the NCX must be referenced by the spine toc attribute."
                if (!node) {
                    var spine = xml.querySelector("spine");
                    var tocId = spine.getAttribute("toc");
                    if (tocId) {
                        node = manifestNode.querySelector("item[id='" + tocId + "']");
                    }
                }

                var tocpath = node ? node.getAttribute('href') : false;
                if (!tocpath) {
                    throw new Error('can not get toc path');
                }
                return tocpath;
            }

            function parseContainer(resp) {
                var xml = parse(resp);
                console.log(xml.documentElement.nodeName);
                if (!xml.getElementsByTagName('rootfile')[0]) {
                    throw new Error("rootfile not found");
                }
                var opfPath = xml.getElementsByTagName('rootfile')[0].getAttribute("full-path");
                // opf path is root, all others related to this path
                // path poiter to opf folder
                if (me.options.folder) {
                    var sub = opfPath.substr(0, opfPath.lastIndexOf('/'));

                    me.bookPath = me.path + sub;
                    if (sub.length > 0) me.bookPath += '/';
                    opfPath = me.path + opfPath;
                } else {
                    var sub = opfPath.substr(0, opfPath.lastIndexOf('/'));
                    me.bookPath = opfPath.substr(0, opfPath.lastIndexOf('/'));
                    if (sub.length > 0) me.bookPath += '/';
                }

                //return http.get( me.path+'/'+opfPath).then(function (resp) {
                return me.get(opfPath, false).then(function (resp) {
                    // 1st pakage.opf and spine
                    var xml = parse(resp);
                    //me.opf = xml;
                    me.nav.setOpf(xml);

                    // 2nd get toc
                    var tocpath = getTocPath(xml, me.spine);
                    return me.get(tocpath).then(function (resp) {
                        //me.toc = parse(resp);
                        me.nav.setToc(parse(resp));
                        return me;
                    });
                });
            }

            function gotoLastView() {
                return me.gotoLastView();
            }

            /**now show to view */
            function showTime() {
                me.renderView(me.options.view);
                me.renderToc(me.options.toc);
                return me;
            }

            var containerPath = 'META-INF/container.xml';
            if (this.options.folder) {
                return this.get(this.path + containerPath, false).then(parseContainer).then(showTime).then(gotoLastView);
            } else {
                return this.initZip(this.path).then(function () {
                    return me.get(containerPath, false).then(parseContainer).then(showTime).then(gotoLastView);
                });
            }
        }
    }, {
        key: 'gotoLastView',
        value: function gotoLastView() {
            var me = this;
            if (me.options.saveLastView) {
                var epubcfi = window.localStorage.getItem(me.uid());
                if (epubcfi) {
                    // back to cfi
                    var r = epubcfi.match(/^epubcfi\((.*)\)$/);
                    if (r) {
                        var cfi = decodeURI(r[1]);
                        me.gotoCfi(cfi);
                    }
                }
            }
            return me;
        }
    }, {
        key: 'remLastView',
        value: function remLastView() {
            var epubcfi = window.localStorage.setItem(me.uid(), null);
        }
    }, {
        key: 'onUnload',
        value: function onUnload() {
            if (this.options.saveLastView) {
                var cif = this.firstVisiableElm();
                var uid = this.uid();
                window.localStorage.setItem(uid, cif);
            }
        }
    }]);

    return Epub;
}();