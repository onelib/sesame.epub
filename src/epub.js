// https://raw.githubusercontent.com/IDPF/epub-revision/master/src/samples/cfi/epubcfi.js
//http://stackoverflow.com/questions/16792578/how-to-create-a-epub-annotation-with-save-option-within-the-epub
//http://matt.garrish.ca/2013/03/navigating-cfis-part-1/
//http://matt.garrish.ca/2013/03/navigating-cfis-part-1/
'use strict'
var BODY_HOLDER_ID = '__epub_body__';



class Epub{
    /**
     * contruction
     * path = /books/moby-dick/
     * path = /books/moby-dick.epub
     * container.xml -> package.opf -> toc.ncx
     *                   index files   index
     */
    constructor(path, http, options) {
        var optDefault = {
            view: null,
            toc: null,
            saveLastView: true,
            folder: true, /** epub in forlder of .epub file */
        }
        window.$http = http;
        for(var k in optDefault){
            if(options[k] === undefined){
                options[k] = optDefault[k];
            }
        }
        this.path = path;
        this.options = options;
        if (this.options.folder && this.path[this.path.length-1] !== '/')
            this.path += '/';
        this.myRenderToc.bind(this);
        this.nav = new Nav(); // navigation
        this.epub = {}; // some epub information
    }

    /**
     * render to element
     */
    renderView(view){
        this.view = view;
        this.showChapterByIndex('first');
        var me =  this;
        this.view.onclick = function(evt){
             var body = document.getElementById(BODY_HOLDER_ID);
             var cfi = cfiAt(body, evt);
             window.location.hash = encodeURI('epubcfi('+me.nav.toCFI() + cfi+')');
             //
        }
    }

    uid(){
        if (!this.epub.uid){
            var iden = this.nav.opf['package']['@attributes']['unique-identifier'];
            var meta = this.nav.opf['package']['metadata'];
            for(var k in meta){
                var elm = meta[k];

                if(Array.isArray(elm)){
                    var len = elm.length;
                    for(var i = 0; i < len; i++){
                        var e = elm[i];
                        if(e['@attributes']){
                            if(e['@attributes']['id'] === iden){
                                this.epub.uid = e['#text'];
                                return this.epub.uid;
                            }
                        }
                    }
                }
                else{
                    var a;
                    if(a = elm['@attributes']){
                        if(a['id'] === iden){
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
    firstVisiableElm(){
        var body = document.getElementById(BODY_HOLDER_ID );
        var evt = {
            x: body.offsetLeft,
            y: body.offsetTop,
        };

        var posCfi = cfiAt(body, evt);
        // console.log(cfiat);
        return this.epubCfi(posCfi);
    }

    /**
     * epub cfi = navCfi + posCfi
     */
    epubCfi(posCfi){
        return 'epubcfi('+this.nav.toCFI() + posCfi+')';
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
        ///var src = this.nav.cfiToChapter(cfi);
        var src = this.nav.cfiToChapter(cfi);
        return this.readHtml(src).then(toCfiPos);
    }

    /**
     * default render handle
     */
    renderToc(elm, handle){
       if (!handle){
           this.myRenderToc(elm);
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

    getFile(path){
        return path.split('#');
    }

    myRenderToc(elm){
        let navMap = this.nav.navPoints();
        let me = this;
        var index = 0;

        function makeToc(navMap){
            let ul = document.createElement("ul");

            navMap.forEach(function (e) {
                let li = document.createElement("li");
                let a = document.createElement("a");
                a.innerText = e.navLabel.text['#text'];
                a.setAttribute('href', '#');
                a.setAttribute('src', e['content']['@attributes']['src']);
                a.setAttribute('id', e['@attributes']['id']);
                a.onclick = function(e){
                    function goElm(hash){
                        var b = document.getElementById(BODY_HOLDER_ID);
                        var seekElm = b.querySelector("[id='"+hash+"']") ||
                                        b.querySelector('[name="'+hash+']"');
                        if(seekElm){
                            me.gotoElm(seekElm);
                        }
                    }
                    var path = this.getAttribute('src');
                    path = path.split('#');

                    var next = me.nav.setIndexFromSource(path[0]);
                    if (next == true){
                        me.readHtml(path[0]).then(function(){
                            // seek to element
                            if (path.length > 1){
                                goElm(path[1]);
                            }
                        })
                    }
                    else{
                        if (path.length > 1){
                            goElm(path[1]);
                        }
                        else{
                            // goto first page
                            me.gotoPage(0);
                        }
                    }
                }
                li.appendChild(a);
                ul.appendChild(li);
                if (e['navPoint']){
                    let childToc = makeToc(e['navPoint']);
                    li.appendChild(childToc);
                }
            })
            return ul;
        }

        var toc = makeToc(navMap);
        elm.appendChild(toc);
        return this;
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
                break;
            case 'back':
                if  (this.nav.gotoPage('back') === false){
                    var me = this;
                    this.showChapterByIndex('back').then(function(){
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
        this.view.scrollLeft = this.nav.page.current*(w);
    }

    gotoElm(elm) {
        if(!elm)
            return;
        var rect = elm.getBoundingClientRect ? elm.getBoundingClientRect():elm.parentElement.getBoundingClientRect();

        // var page = 0;
        // var left= 0;
        // var curr = this.nav.page.current;
        //     -w   0  +w
        // +--+--+--+--+
        // |  |  |  |  |
        // +--+--+--+--+

        // prev
        if (rect.left < 0){
            var w = (-1) * this.view.offsetWidth;
            //if (rect.left >= w) return;
            var page = Math.ceil(rect.left/w);
            var toPage = this.nav.page.current-page;
            if (toPage < 0) toPage = 0;
            this.gotoPage(toPage);
        }
        else{ // forward
            var w = this.view.offsetWidth;
            if (rect.left <= w) return;
            var page = Math.ceil(rect.left/w);
            var toPage = (this.nav.page.current+page)-1;
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

    showChapterByIndex(index, cb){
        var src = this.nav.gotoIndex(index);
        //this.nav.pagePreCif();
        return this.readHtml(src);
    }

    _processContent(content) {
        let contentDom = parse(content);
        let css = contentDom.querySelectorAll('link[type="text/css"]');
        for(let i=0; i < css.length;  i++){
            let e = css[i];
            var href = e.getAttribute('href').replace("..","");
            href = this.bookPath + href
            e.setAttribute('href', href.replace("//","/"));
        }
        var img = contentDom.querySelectorAll('img');
        for(let i=0; i < img.length;  i++){
            let e = img[i];
            let src = e.getAttribute('src').replace("..","");
            src = this.bookPath + src;

            e.setAttribute('src', src.replace("//","/"));
        }
        img = contentDom.querySelectorAll('image');
        for(let i=0; i < img.length;  i++){
            let e = img[i];
            let src = e.getAttribute('xlink:href').replace("..","");
            src = this.bookPath + src;

            e.setAttribute('xlink:href', src.replace("//","/"));
        }
        // html file display on div : all head + body will remove
        // we create wrapper to handle body element
        var wrapBody = document.createElement('div');
        wrapBody.setAttribute("id", BODY_HOLDER_ID);
        var body = contentDom.body ? contentDom.body: contentDom.getElementsByTagName('body')[0];
        while (body.firstChild) {
            wrapBody.appendChild(body.firstChild);
        }
        body.appendChild(wrapBody);

        return contentDom;
    }

    readHtml(url, view){
        //let path = this.bookPath + url;
        let me = this;
        view = view || this.view;
        //var v = view;
        function show(resp) {
            let content = me._processContent(resp);
            let t = new XMLSerializer().serializeToString(content.documentElement);
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
    get(path, bookPath){
        // if (!window.$http)
        //     window.$http = axios;

        if (bookPath !== false)
            bookPath = true;
        // remove some hash  # of path
        var hash = path.indexOf('#');
        if (hash !== -1){
            path = path.substr(0, hash);
        }
        // first time is no bookPath
        var fpath = bookPath ? this.bookPath + path: path

        if(this.options.folder){
            return $http.get(fpath).then(function(resp){
                return resp.data;
            });
        }

        return this.zip.file(fpath).async('string') ;
    }

    /**
     * .epub file package in zip format
     */
    initZip(path){
        var me = this;
        return $http.get(path, {responseType: "arraybuffer"})
            .then(function(resp, err){
            var zip = new JSZip();
            return zip.loadAsync(resp.data)
                .then(function(zip) {
                    // zip.forEach(function (relativePath, zipEntry) {
                    //     console.log(zipEntry.name);
                    // });
                    me.zip = zip;
                    return zip;
                }, function (e) {
                    throw e;
                }
            );
        });
    }


    init(){
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
            var xml = parse(resp);
            console.log(xml.documentElement.nodeName);
            if(!xml.getElementsByTagName('rootfile')[0]){
                throw new Error("rootfile not found");
            }
            var opfPath = xml.getElementsByTagName('rootfile')[0].getAttribute("full-path");
            // opf path is root, all others related to this path
            // path poiter to opf folder
            if (me.options.folder){
                var sub = opfPath.substr(0, opfPath.lastIndexOf('/'));

                me.bookPath = me.path + sub
                if(sub.length > 0) me.bookPath += '/';
                opfPath = me.path + opfPath;
            }
            else{
                var sub = opfPath.substr(0, opfPath.lastIndexOf('/'));
                me.bookPath = opfPath.substr(0, opfPath.lastIndexOf('/'));
                if(sub.length > 0) me.bookPath += '/';
            }

            //return http.get( me.path+'/'+opfPath).then(function (resp) {
            return me.get(opfPath, false).then(function (resp) {
                // 1st pakage.opf and spine
                let xml = parse(resp);
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

        function gotoLastView(){
            return me.gotoLastView();
        }

        /**now show to view */
        function showTime(){
            me.renderView(me.options.view);
            me.renderToc(me.options.toc);
            return me;
        }

        let containerPath = 'META-INF/container.xml';
        if(this.options.folder){
             return this.get(this.path + containerPath, false)
                .then(parseContainer)
                .then(showTime)
                .then(gotoLastView);
        }
        else{
            return this.initZip(this.path).then(function(){
                return me.get(containerPath, false)
                    .then(parseContainer)
                    .then(showTime)
                    .then(gotoLastView);
            });
        }
    }

    gotoLastView(){
        var me = this;
        if(me.options.saveLastView){
            var epubcfi = window.localStorage.getItem(me.uid());
            if(epubcfi){
                // back to cfi
                var r = epubcfi.match(/^epubcfi\((.*)\)$/);
                if( r ){
                    var cfi = decodeURI(r[1]);
                    me.gotoCfi(cfi);
                }
            }
        }
        return me;
    }

    remLastView(){
        var epubcfi = window.localStorage.setItem(me.uid(), null);
    }

    onUnload(){
        if(this.options.saveLastView){
            var cif = this.firstVisiableElm();
            var uid = this.uid();
            window.localStorage.setItem(uid, cif);
        }
    }
}

