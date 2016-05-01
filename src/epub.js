// https://raw.githubusercontent.com/IDPF/epub-revision/master/src/samples/cfi/epubcfi.js
//http://stackoverflow.com/questions/16792578/how-to-create-a-epub-annotation-with-save-option-within-the-epub
//http://matt.garrish.ca/2013/03/navigating-cfis-part-1/
//http://matt.garrish.ca/2013/03/navigating-cfis-part-1/
'use strict'
var BODY_HOLDER_ID = '__epub_body__';
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
		obj = xml.nodeValue.trim();
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

function Nav() {
    this.chapterIndex = 0;

    this.setPage = function(page){
        this.page = page;
    }

    this.setToc = function(toc){
        this.toc = toc;
    }

    this.setOpf = function(opf){
        this.opf = opf;
    }

    this.gotoChapter = function(index){
        var inorder = index;
        switch(index){
            case 'next':
                inorder = this.chapterIndex+1;
                break;
            case 'back':
                inorder = this.chapterIndex-1;
                break;
            case 'first':
                inorder = 0;
                break;
            default:
                inorder = index;
                break;
        }

        var navList = this.toc['ncx']['navMap']['navPoint'];
        var len = navList.length;

        try {
            inorder = parseInt(inorder);
        } catch (error) {
            throw new Error("play order must in number");
        }

        if (inorder < 0 || inorder >= len){
            throw new Error("play order out of range : " + inorder);
        }

        this.chapterIndex = inorder;
        var e = navList[inorder];
        var src = e['content']['@attributes']['src'];
        return src;
    }

    /**
     * current html file to CFI
     * cfi pre = /6(spine) + index of spine item
     * [          package.opf     ]   [ toc.ncx  ]   [package.opf]
     * spine.idref --> manifest.id -->navPoint.id => manifest.href
     */
    this.toCFI = function(){

        /* toc.ncx => id */
        var navList = this.toc['ncx']['navMap']['navPoint'];
        var e = navList[this.chapterIndex];
        var id = e['@attributes']['id'];// ['content']['@attributes']['src'];

        /* id => spine index */
        var spine = this.opf.package.spine.itemref;

        var i = 0, found = false;
        for(i = 0; i < spine.length; i++){
            var s = spine[i];
            if (s['@attributes']['idref'] === id){
                found = true;
                break;
            }
        }

        if (!found){
            throw new Error('spince not found for chapter')
        }
        /**
         * /6 = spine
         * /(i+1)*2 = index of spine item
         * !/4 = body tag of document
         */
        return '/6/'+(i+1)*2 +'!/4';
    }

    this.cfiToChapter = function(cfi){
        // cfi in format '/6/(i+1)*2!/4'
        // cfi in format '/6/x*2!/4'
        var r = cfi.match(/^\/6\/(\d+)(\[([-a-zA-Z_0-9.\u007F-\uFFFF]+)\])?/);
        var targetIndex = r[1] - 0;
        var index = (targetIndex/2) - 1; // position on spine

        var spineList = this.opf.package.spine.itemref;
        var idref = spineList[index]['@attributes']['idref'];

        // step 2. find idref in toc
        var navList = this.toc['ncx']['navMap']['navPoint'];
        var i = 0, found = false;
        for(i = 0; i < navList.length; i++){
            var item = navList[i];
            if (item['@attributes']['id'] === idref){
                found = true;
                break;
            }
        }
        if (!found){
            throw new Error('idref not found ' + idref);
        }
        return this.gotoChapter(i);
    }

    this.gotoPage = function (page){
        switch (page) {
            case 'next':

                if(this.page.current >= this.page.total){
                    return false;
                }
                else{
                    this.page.current += 1;
                }
                break;
            case 'back':
                if(this.page.current <= 0){
                    return false;
                }
                else{
                    this.page.current -= 1;
                }
                break;
            case 'last':
                this.page.current = this.page.total;
                break;
            default:
                /* goto numner */
                try{
                    page = parseInt(page);
                    if (page < 0 || page > this.page.total){
                        return new Error('page out of range ' + page)
                    }
                    this.page.current = page;
                }
                catch (error) {
                    return error;
                }
                break;
        }
    }
}


class Epub{
    /**
     * contruction
     * path = /books/moby-dick/
     * path = /books/moby-dick.epub
     * container.xml -> package.opf -> toc.ncx
     *                   index files   index
     */
    constructor(path, options) {
        this.path = path;
        this.path += '/';
        this.options = options;
        this.navDefaultHandle.bind(this);
        this.nav = new Nav();
    }

    /**
     * render to element
     */
    render(view){
        this.view = view;
        this.showChapterByIndex('first');
        var me =  this;
        this.view.onclick = function(evt){
             //markAndReload (me.view, evt);
             var body = document.getElementById(BODY_HOLDER_ID);
             var cfi = cfiAt(body, evt);
            //  var body2 = document.getElementById(BODY_HOLDER_ID);
            //  var p = decodeCFI(body2, cfi);
            //  console.log(cfif);
            //  console.log(p);
             window.location.hash = 'epubcfi('+me.nav.toCFI() + cfi+')';
             //
        }
    }

    gotoCfi(cfi){
        var me = this;
        function toCfiPos(){
            var r;
            if(r = cfi.match(/!\/4.*/)){
                var cfi2 = r[0].substr(r[0].indexOf('/', 2));
                var body = document.getElementById(BODY_HOLDER_ID);
                var point = decodeCFI(body, cfi2);
                console.log(point);
                me.gotoElm(point.node);
            }
        }
        var src = this.nav.cfiToChapter(cfi);
        return this.readHtml(src).then(toCfiPos);
    }

    /**
     * default render handle
     */
    renderNav(elm, handle){
       if (!handle){
           this.navDefaultHandle(elm);
       }
       else{
           handle(elm);
       }
    }

    tocAsJson(){
        if(!this.tocJson){
            this.tocJson = xmlToJson(this.toc);
        }
        return this.tocJson;
    }

    opfAsJson(){
        if(!this.opfJson){
            this.opfJson = xmlToJson(this.opf);
        }
        return this.opfJson;
    }

    navDefaultHandle(elm){
        let tocj = this.tocAsJson();
        let navMap = tocj.ncx.navMap.navPoint;
        let ul = document.createElement("ul");
        let me = this;
        var index = 0;
        navMap.forEach(function (e) {
           let li = document.createElement("li");
           let a = document.createElement("a");
           a.innerText = e.navLabel.text['#text'];
           a.setAttribute('href', '#');
           a.setAttribute('index', index);
           a.setAttribute('id', e['@attributes']['id']);
           a.onclick = function(e){
               me.gotoFile(this);
           }
           li.appendChild(a);
           ul.appendChild(li);
           index ++;
        });
        elm.appendChild(ul);

        return this;
    }

    gotoFile(elm){
        this.showChapterByIndex(elm.getAttribute('index'));
    }

    calcPages(){
        var scrollWidth = this.view.scrollWidth,
            containerW = this.view.offsetWidth,
            total = Math.ceil(scrollWidth / containerW) - 1; // start at 0
        var page = {
            current: 0,
            total: total,
            width: this.view.offsetWidth
        }
        this.nav.setPage(page);

        this.view.scrollLeft = 0;

        if((scrollWidth % containerW) !== 0){
            var frag = document.createDocumentFragment();
            var p = document.createElement("p");
            p.innerHTML = '&nbsp';
            p.style.height = "99%";

            frag.appendChild(p);
            this.view.appendChild(frag);
        }
    }

    gotoPage(page){
        var inpage =  page;
        switch(page){
            case 'next':
                if (this.nav.gotoPage('next') == false){
                    this.showChapterByIndex('next');
                    return;
                }
                // if(this.nav.page.current >= this.nav.page.total){
                //     this.showChapterByIndex('next');
                //     return;
                // }
                // else{
                //     this.nav.gotoPage('next');
                //     ///this.page.current += 1;
                // }
                break;
            case 'back':
                if  (this.nav.gotoPage('back') === false){
                    var me = this;
                    this.showChapterByIndex('back').then(function(){
                        me.gotoPage('last');
                    });
                    return;
                }
                // if(this.page.current <= 0){
                //     var me = this;
                //     this.showChapterByIndex('back').then(function(){
                //         me.gotoPage('last');
                //     });
                //     return;
                // }
                // else{
                //     this.page.current -= 1;
                // }
                break;
            case 'last':
                this.nav.gotoPage('last');
                //this.page.current = this.page.total;
                break;
            default:
                this.nav.gotoPage(page);
                // // goto numner
                // try{
                //     page = parseInt(page);
                //     if (page < 0 || page > this.page.total){
                //         return new Error('page out of range ' + page)
                //     }
                //     this.page.current = page;
                // }
                // catch (error) {
                //     return error;
                // }

                break;
        }

        var w = this.view.offsetWidth;
        // goto page
        //this.view.scrollLeft = this.page.current*(w);
        this.view.scrollLeft = this.nav.page.current*(w);
    }


    scl(){
        var elm = view.getElementById("nguyen");//document.getElementById("nguyen");
        this.gotoElm(elm);
    }

    gotoElm(elm) {
        if(!elm)
            return;
//        var rect = elm.getBoundingClientRect();
        var rect = elm.getBoundingClientRect ? elm.getBoundingClientRect():elm.parentElement.getBoundingClientRect();
        var w = this.view.offsetWidth;
        var page = 0;
        var left= 0;

        while (page <= this.nav.page.total) {
            // elm.left > view.left && elm.left < view.left + this.view.offsetWidth;
            if (rect.left > left && rect.left < left + w){
                this.gotoPage(page)
                break;
            }
            page ++;
            left = page*w;
        }
    }

    checkVisible(elm) {
        /*
        bottom 134
        height 17
        left 3847.59375
        right 3923.328125
        top 117
        width 75.734375

        scrollWidth ~ 10k

        */
        var rect = elm.getBoundingClientRect ? elm.getBoundingClientRect():elm.parentElement.getBoundingClientRect();
//        var rect = elm.getBoundingClientRect();
        var scrollWidth = this.view.scrollWidth;
        var viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
        return !(rect.bottom < 0 || rect.top - viewHeight >= 0);
       // (rect.bottom > 0 && rect.top - viewHeight <= 0);
    }

    /**
     * toc playorder = 1,2,3...
     * Params:
     * order = 'next' / 'back', 'first' or number,
     * cb = do affter load chapter complete (aync ?)
     */

    showChapterByIndex(index, cb){
        var src = this.nav.gotoChapter(index);
        //this.nav.pagePreCif();
        return this.readHtml(src);
    }

    _processContent(content) {
        let contentDom = parse(content);
        let css = contentDom.querySelectorAll('link[type="text/css"]');
        for(let i=0; i < css.length;  i++){
            let e = css[i];
            e.setAttribute('href', this.bookPath + e.getAttribute('href'));
        }
        var img = contentDom.querySelectorAll('img');
        for(let i=0; i < img.length;  i++){
            let e = img[i];
            e.setAttribute('src', this.bookPath + e.getAttribute('src'));
        }
        // html file display on div : all head + body will remove
        // we create wrapper to handle body element
        var wrapBody = document.createElement('div');
        wrapBody.setAttribute("id", BODY_HOLDER_ID);
        while (contentDom.body.lastChild) {
            wrapBody.appendChild(contentDom.body.lastChild);
        }
        contentDom.body.appendChild(wrapBody);

        return contentDom;
    }

    readHtml(url, view){
        let path = this.bookPath + url;
        let me = this;
        view = view || this.view;
        //var v = view;
        function show(resp) {
            let content = me._processContent(resp.data);
            let t = new XMLSerializer().serializeToString(content.documentElement);
            view.innerHTML = t;
            me.calcPages();
            me.dom = content;
        }

        return http.get(path).then(show);
    }

    init(){
        let containerPath = this.path + '/META-INF/container.xml';
        let me = this;

        function getTocPath(xml) {
            var node = xml.querySelector("item[media-type='application/x-dtbncx+xml']");
            // If we can't find the toc by media-type then try to look for id of the item in the spine attributes as
            // according to http://www.idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.4.1.2,
            // "The item that describes the NCX must be referenced by the spine toc attribute."
            if (!node) {
                var spine = xml.querySelector("spine");
                var tocId = spine.getAttribute("toc");
                if(tocId) {
                    node = manifestNode.querySelector("item[id='" + tocId + "']");
                }
            }

            var tocpath = node ? node.getAttribute('href') : false;
            if (!tocpath){
                throw new Error('can not get toc path');
            }
            return tocpath;
        }

        function parseContainer(resp){
            var xml = parse(resp.data);
            console.log(xml.documentElement.nodeName);
            var opfPath = xml.getElementsByTagName('rootfile')[0].getAttribute("full-path");
            // opf path is root, all others related to this path
            // path poiter to opf folder
            me.bookPath = me.path + opfPath.substr(0, opfPath.lastIndexOf('/')) + '/';
            return http.get( me.path+'/'+opfPath).then(function (resp) {
                // 1st pakage.opf and spine
                let xml = parse(resp.data);
                me.opf = xml;
                me.nav.setOpf(me.opfAsJson());
                // 2nd get toc
                var tocpath = getTocPath(xml, me.spine);
                // toc path relative with opfPath
                tocpath = opfPath.substr(0, opfPath.lastIndexOf('/')) + '/' + tocpath;
                return http.get(me.path+'/'+tocpath).then(function (resp) {
                    me.toc = parse(resp.data);
                    me.nav.setToc(me.tocAsJson());
                    return me;
                });
            });
        }

        return http.get(containerPath)
            .then(parseContainer);
    }

}

