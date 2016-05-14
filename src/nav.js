'use strict'

function parse(xml){
    if (window.DOMParser){
        var parser=new DOMParser();
        var xmlDoc=parser.parseFromString(xml, "text/xml");
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


/**
 * navigation control class
 * [nav item]
 */
function Nav() {
    this.chapterIndex = 0;

    this.setPage = function(page){
        this.page = page;
    }

    /**
     * navpoints
     *   navpoint   -> html
     *   navpoint   -> html
     *   navpoint   -> html
     *   ....       -> html
     */
    this.setToc = function(toc){
        var jtoc = xmlToJson(toc);
        this.toc = jtoc;
        // this.extractHtmlFiles();
    }

    this.setOpf = function(opf){
        this.opf = xmlToJson(opf);
        this.setSpinesSource();
    }

    this.navPoints =function(){
        if (!this._navPoints){
            var ncx = this.toc['ncx'];
            var navMap = null;
            if (Array.isArray(ncx)){
                for(var ncxIndex in ncx){
                    if (ncx[ncxIndex]['navMap']){
                        navMap = ncx[ncxIndex]['navMap']['navPoint'];
                        break;
                    }
                }
            }
            else{
                navMap = ncx['navMap']['navPoint'];
            }
            this._navPoints = navMap;
        }

        return this._navPoints;
    }

    /**
     * link spines to html files source
     */
    this.setSpinesSource = function (params) {
        var spineList = this.opf.package.spine.itemref;
        var manifestList = this.opf.package.manifest.item;

        var i, idref,
            l = spineList.length;
        var manifestLen = manifestList.length;

        for(i = 0; i < l; i++){
            var s = spineList[i];
            idref = s['@attributes']['idref'];
            var j;
            for(j = 0; j < manifestLen; j++){
                var m =  manifestList[j];
                if(m['@attributes']['id'] == idref){
                    s['src'] = m['@attributes']['href'];
                    break;
                }
            }
        }
        this.spines = spineList;
    }

    /**
     * update chapterIndex then
     * return true if change index
     * else return false
     */
    this.setIndexFromSource = function(source){
        for(var i = this.spines.length - 1; i >= 0; i -= 1){
            if(this.spines[i]['src'] == source){
                if (this.chapterIndex == i){
                    return false;
                }
                this.chapterIndex = i;
                return true;
            }
        }
        throw new Error("source not found :"+source);
    }

    /**
     * spine list
     */
    // this.spines = function () {
    //     return this.opf.package.spine.itemref;
    // }

    /**
     * navPoint --> html <-- spine
     */
    this.extractHtmlFiles = function(){
        var rootPoints = this.navPoints();
        var files = [];

        function getNavFile(n){
            // Text/calibre_quick_start_split_007.xhtml#task2.2
            var file = n['content']['@attributes']['src'],
                hash = file.indexOf('#');
            if(hash !== -1){
                file = file.substr(0, hash);
            }
            return file;
        }

        function getNavFiles(navPoints) {
            var i, l = navPoints.length;
            for (i = 0; i < l; i++){
                var n = navPoints[i];
                var fname = getNavFile(n);
                var last =  files[files.length - 1];
                if(last !== fname){
                    files.push(fname);
                }
                if(n['navPoint']){
                    getNavFiles(n['navPoint']);
                }
            }
        }
        getNavFiles(rootPoints);
        this.htmlFiles = files;
    }

    this.gotoIndex = function(index){
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

        // var navMap = this.navPoints();
        // var navList = navMap['navPoint'];
        // var len = navList.length;

        try {
            inorder = parseInt(inorder);
        } catch (error) {
            throw new Error("play order must in number");
        }

        if (inorder < 0 || inorder >= this.spines.length){
            throw new Error("play order out of range : " + inorder);
        }

        this.chapterIndex = inorder;
        // var e = navList[inorder];
        var src = this.spines[this.chapterIndex]['src'];
        return src;
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

    /**
     * current html file to CFI
     * cfi pre = /6(spine) + index of spine item
     * [          package.opf     ]   [ toc.ncx  ]   [package.opf]
     * spine.idref --> manifest.id -->navPoint.id => manifest.href
     */
    this.toCFI = function(){

        /* toc.ncx => id */
        var navList = this.navMap()['navPoint'];
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
            // some epub reply with playorder
            i = e['@attributes']['playOrder'] - 1; //? playorder start with 1 but  spine start 0
            //throw new Error('spince not found for chapter')
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
        if(!spineList[index]){
            // remove last view
            throw Error("index out of range: " + index);
        }
        var idref = spineList[index]['@attributes']['idref'];

        // step 2. find idref in toc
        var i = 0, found = false;
        // epub 2
        if (!spineList[index]['@attributes']['linear'] ||
             spineList[index]['@attributes']['linear'] !== 'yes'){

             i = index;
             found = true;
        }
        else{
            var navList = this.getNavMap()['navPoint'];
            for(i = 0; i < navList.length; i++){
                var item = navList[i];
                if (item['@attributes']['id'] === idref){
                    found = true;
                    break;
                }
            }
        }
        if (!found){
            throw new Error('idref not found ' + idref);
        }
        return this.gotoChapter(i);
    }


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