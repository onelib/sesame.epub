// var parseXML = require('/src/parseXML')
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var http = axios;
function parse(xml){
    if (window.DOMParser){
        var parser=new DOMParser();
        var xmlDoc=parser.parseFromString(xml,"text/xml");
    }
    else {
        var xmlDoc=new ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async=false;
        xmlDoc.loadXML(xml);
    }
    return xmlDoc;

}

// Changes XML to JSON
// https://davidwalsh.name/convert-xml-json
function xmlToJson(xml) {
	// Create the return object
	var obj = {};

	if (xml.nodeType == 1) { // element
		// do attributes
		if (xml.attributes.length > 0) {
		obj["@attributes"] = {};
			for (var j = 0; j < xml.attributes.length; j++) {
				var attribute = xml.attributes.item(j);
				obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
			}
		}
	} else if (xml.nodeType == 3) { // text
		obj = xml.nodeValue;
	}

	// do children
	if (xml.hasChildNodes()) {
		for(var i = 0; i < xml.childNodes.length; i++) {
			var item = xml.childNodes.item(i);
			var nodeName = item.nodeName;
			if (typeof(obj[nodeName]) == "undefined") {
                //var o = xmlToJson(item);
                //if (typeof(o) ==="object")
				obj[nodeName] = xmlToJson(item);
			} else {
				if (typeof(obj[nodeName].push) == "undefined") {
					var old = obj[nodeName];
					obj[nodeName] = [];
					obj[nodeName].push(old);
				}
                // empty object
                var o = xmlToJson(item);
                if (typeof(o) ==="object")
				    obj[nodeName].push(o);
			}
		}
	}
	return obj;
};

var Epub = function () {
    /**
     * contruction
     * path = /books/moby-dick/
     * path = /books/moby-dick.epub
     * container.xml -> package.opf -> toc.ncx
     *                   index files   index
     */

    function Epub(path, options) {
        _classCallCheck(this, Epub);

        this.path = path;
        this.path += '/';
        this.options = options;
        this.navDefaultHandle.bind(this);
    }

    /**
     * render to element
     */


    _createClass(Epub, [{
        key: "render",
        value: function render(view) {
            this.view = view;
            this.readHtml('preface_001.xhtml', view);
        }

        /**
         * default render handle
         */

    }, {
        key: "renderNav",
        value: function renderNav(elm, handle) {
            if (!handle) {
                this.navDefaultHandle(elm);
            } else {
                handle(elm);
            }
        }
    }, {
        key: "navDefaultHandle",
        value: function navDefaultHandle(elm) {
            var tocj = xmlToJson(this.toc);
            var navMap = tocj.ncx.navMap.navPoint;
            var ul = document.createElement("ul");
            var me = this;
            navMap.forEach(function (e) {
                var li = document.createElement("li");
                var a = document.createElement("a");
                a.innerText = e.navLabel ? e.navLabel.text['#text'] : "???";
                a.setAttribute('href', '#');
                a.setAttribute('content', e.content['@attributes'].src);
                //a.setAttribute('onclick', 'function(e){Epub.gotoFile(e)}');
                a.onclick = function (e) {
                    me.gotoFile(this);
                };
                li.appendChild(a);
                //    li.innerText = e.navLabel.text['#text'];
                ul.appendChild(li);
            });
            elm.appendChild(ul);

            return this;
        }
    }, {
        key: "gotoFile",
        value: function gotoFile(elm) {
            console.log(elm.getAttribute('content'));
            this.readHtml(elm.getAttribute('content'));
        }
    }, {
        key: "parseContent",
        value: function parseContent(content) {
            var contentDom = parse(content);
            var css = contentDom.querySelectorAll('link[type="text/css"]');
            for (var i = 0; i < css.length; i++) {
                var e = css[i];
                e.setAttribute('href', this.bookPath + e.getAttribute('href'));
            }
            return contentDom;
        }
    }, {
        key: "readHtml",
        value: function readHtml(url, view) {
            var path = this.bookPath + url;
            var me = this;
            view = view || this.view;
            //var v = view;
            function show(resp) {
                var content = me.parseContent(resp.data);
                var t = new XMLSerializer().serializeToString(content.documentElement);
                view.innerHTML = t;
            }

            http.get(path).then(show);
            //this.epubView.innerHTML= `

            //`
            //'<object type="text/html" data="'+url+'" ></object>';
        }
    }, {
        key: "init",
        value: function init() {
            var containerPath = this.path + '/META-INF/container.xml';
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
                var xml = parse(resp.data);
                console.log(xml.documentElement.nodeName);
                var opfPath = xml.getElementsByTagName('rootfile')[0].getAttribute("full-path");
                // opf path is root, all others related to this path
                // path poiter to opf folder
                me.bookPath = me.path + opfPath.substr(0, opfPath.lastIndexOf('/')) + '/';
                return http.get(me.path + '/' + opfPath).then(function (resp) {
                    // 1st opf and spine
                    var xml = parse(resp.data);
                    me.opf = xml;

                    // 2nd get toc
                    var tocpath = getTocPath(xml, me.spine);
                    // toc path relative with opfPath
                    tocpath = opfPath.substr(0, opfPath.lastIndexOf('/')) + '/' + tocpath;
                    return http.get(me.path + '/' + tocpath).then(function (resp) {
                        me.toc = parse(resp.data);
                        return me;
                    });
                });
            }

            return http.get(containerPath).then(parseContainer);
        }
    }, {
        key: "toString",
        value: function toString() {
            return "(" + this.path + ")";
        }
    }]);

    return Epub;
}();