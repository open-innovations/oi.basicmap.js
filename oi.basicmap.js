/**
	Open Innovations Basic SVG-based Map v 1.0.1
**/
(function(root){
	// Part of the OI namespace
	var OI = root.OI || {};
	if(!OI.ready){
		OI.ready = function(fn){
			// Version 1.1
			if(document.readyState != 'loading') fn();
			else document.addEventListener('DOMContentLoaded', fn);
		};
	}
	var xmlns = 'http://www.w3.org/2000/svg';
	function setAttr(el,prop){
		for(var p in prop){
			if(prop[p]) el.setAttribute(p,prop[p]);
		}
		return el;
	}
	function svgEl(t){ return document.createElementNS(xmlns,t); }
	function oSize(el){
		var s = getComputedStyle(el);
		return {
			'width':el.offsetWidth + parseInt(s.marginLeft) + parseInt(s.marginRight),
			'height':el.offsetHeight + parseInt(s.marginTop) + parseInt(s.marginBottom)
		};
	}
	function BasicMap(el,attr){
		if(!attr) attr = {};
		this.container = el;
		el.innerHTML = "";
		setAttr(this.container,{'style':'overflow:hidden'});

		var o = oSize(el);
		this.w = (attr.w || o.width);
		this.h = (attr.h || o.height);
		this.attr = attr;

		// Add the SVG
		this.svg = svgEl('svg');
		setAttr(this.svg,{'class':'map-inner','xmlns':xmlns,'version':'1.1','width':this.w,'height':this.h,'viewBox':'-180 0 360 180','overflow':'visible','style':'max-width:100%;max-height:100%;background:'+(attr.background||"white"),'preserveAspectRatio':'xMidYMid meet'});
		el.appendChild(this.svg);

		this.layers = [];
		this.zoom = 12;
		this.bounds = new BBox();
		this.places = (attr.places||[]);
		this.place = (attr.place||"");
		this.toload = 0;
		this.loaded = 0;

		if(attr.layers) this.addLayers(attr.layers,attr.complete);

		return this;
	}
	BasicMap.prototype.insertLayer = function(l,i){
		if(typeof l!=="object" || typeof l.id!=="string"){
			console.warn('Layer does not appear to contain a key',l);
			return {};
		}
		l = new Layer(l,this,i);
		if(l.id){
			if(typeof i==="number") this.layers.splice(Math.max(i,0),0,l);
			else this.layers.push(l);
			l.load();
		}
		return l;	
	};
	BasicMap.prototype.addLayers = function(ls,cb,i){
		if(typeof ls.length!=="number") ls = [ls];

		this.toload = ls.length;
		this.loaded = 0;
		
		function isFinished(){
			this.loaded++;
			if(this.loaded==this.toload){
				if(typeof cb==="function") cb.call(this);
			}
		}
		for(var l = 0; l < ls.length; l++){
			ls[l].callback = isFinished;
			this.insertLayer(ls[l],i);
		}
		return this;
	};
	BasicMap.prototype.addLayersAfter = function(name,ls){
		var i = this.getLayerPos(name)+1;
		return this.addLayers(ls,this.attr.complete,i);
	};
	BasicMap.prototype.addLayersBefore = function(name,ls){
		var i = this.getLayerPos(name)||0;
		return this.addLayers(ls,this.attr.complete,i);
	};
	BasicMap.prototype.getLayerPos = function(l){
		if(typeof l==="string"){
			for(var i = 0; i < this.layers.length; i++){
				if(this.layers[i].id==l) return i;
			}
			return -1;	// No matches
		}
		return l;
	};
	BasicMap.prototype.removeLayer = function(l){
		// Get the index of the layer
		var i = this.getLayerPos(l);
		if(i >= 0 && i < this.layers.length){
			// Remove SVG content for this layer
			this.layers[i].clear();
			// Remove layer from array
			return this.layers.splice(i,1)[0];
		}else{
			return false;
		}
	};
	// Set the bounds of the map
	BasicMap.prototype.setBounds = function(bbox){

		this.bounds = bbox;
		var tileBox = bbox.asTile(this.zoom);

		// Set the view box
		setAttr(this.svg,{'viewBox': (tileBox.x.min)+' '+(tileBox.y.max)+' '+(tileBox.x.range)+' '+(tileBox.y.range)});
		
		// Scale text labels
		var tspans = this.svg.querySelectorAll('tspan');
		var svgLabels = this.svg.querySelectorAll('text');
		if(svgLabels.length > 0){
			var pc = 100;
			pc = 100*(tileBox.x.range > tileBox.y.range ? tileBox.x.range/this.w : tileBox.y.range/this.h);
			var i,j,a,b,lbla,lblb;
			for(i = 0; i < tspans.length; i++) tspans[i].style.fontSize = pc+'%';

			// Remove overlapping labels on a last-in-first-out basis.
			for(i = svgLabels.length-1 ; i >= 0; i--){
				lbla = svgLabels[i];
				lbla.style.display = '';
				a = lbla.getBoundingClientRect();
				for(j = 0; j < svgLabels.length; j++ ){
					lblb = svgLabels[j];
					if(lbla != lblb){
						b = lblb.getBoundingClientRect();
						if( !( b.left > a.right || b.right < a.left || b.top > a.bottom || b.bottom < a.top) ){
							lbla.style.display = 'none';
							continue;
						}
					}
				}
			}
		}
		return this;
	};
	BasicMap.prototype.getBounds = function(){ return this.bounds; };
	BasicMap.prototype.clear = function(){
		// TODO: clear SVG
		this.layers = [];
		return this;
	};
	BasicMap.prototype.zoomToData = function(id){

		// Get bounding box range from all layers
		var bbox = new BBox();
		for(var l = 0; l < this.layers.length; l++){
			if(this.layers[l].bbox){
				if(!id || id == this.layers[l].id){
					bbox.expand(this.layers[l].bbox);
				}
			}
		}
		return this.setBounds(bbox);
	};

	function Layer(attr,map,i){
		if(!attr.id){
			console.error('Layer does not have an ID set');
			return {};
		}
		this.id = attr.id;

		if(typeof attr.data==="string"){
			this._url = attr.data;
			this.data = null;
		}else{
			this.data = attr.data;
		}
		this.attr = (attr || {});
		this.options = (this.attr.options || {});
		if(!this.options.fillOpacity) this.options.fillOpacity = 1;
		if(!this.options.opacity) this.options.opacity = 1;
		if(!this.options.color) this.options.color = '#000000';
		if(typeof this.options.useforboundscalc==="undefined") this.options.useforboundscalc = true;

		var g = svgEl('g');
		var gs;
		setAttr(g,{'class':this.class||this.id});

		if(map && map.svg){
			if(typeof i==="number"){
				gs = map.svg.querySelectorAll('g');
				gs[i].insertAdjacentElement('beforebegin', g);
			}else{
				map.svg.appendChild(g);
			}
		}

		this.clear = function(){ g.innerHTML = ''; return this; };

		// Function to draw it on the map
		this.update = function(){
			// Clear existing layer
			this.clear();
			// Find the map bounds and work out the scale
			var f,i,j,k,dlat,dlon,feature,lat,lon,w,h,b,p,c,d,xy,tspan;
			w = map.w;
			h = map.h;
			b = map.getBounds();
			dlat = (b.lat.max - b.lat.min);
			dlon = (b.lon.max - b.lon.min);
			this.bbox = new BBox();
			
			if(this.data && this.data.features){

				for(f = 0; f < this.data.features.length; f++){
					if(this.data.features[f]){
						feature = this.data.features[f];
						c = feature.geometry.coordinates;

						if(feature.geometry.type == "MultiPolygon"){
							p = svgEl('path');
							setAttr(p,{
								'stroke': this.options.color||this.options.stroke,
								'stroke-opacity':this.options.opacity,
								'stroke-width': this.options['stroke-width']
							});
							d = '';
							for(i = 0; i < c.length; i++){
								for(j = 0; j < c[i].length; j++){
									for(k = 0; k < c[i][j].length; k++){
										this.bbox.expand(c[i][j][k]);
										xy = latlon2xy(c[i][j][k][1],c[i][j][k][0],map.zoom);
										if(k==0) d += 'M'+xy.x+' '+xy.y;
										else d += (k==1 ? ' L':', ')+xy.x+' '+xy.y;
									}
								}
							}
							d += 'Z';
							setAttr(p,{
								'd':d,
								'fill': this.options.color||this.options.fill,
								'fill-opacity': this.options.fillOpacity,
								'vector-effect':'non-scaling-stroke',
								'stroke': this.options.stroke||this.options.color,
								'stroke-width': this.options['stroke-width']||'0.4%',
								'stroke-opacity': this.options['stroke-opacity']||1
							});
							if(typeof attr.style==="function") attr.style.call(this,feature,p);
						}else if(feature.geometry.type == "MultiLineString"){
							p = svgEl('path');
							setAttr(p,{
								'stroke': this.options.color||this.options.stroke,
								'stroke-opacity':this.options.opacity,
								'stroke-width': this.options['stroke-width']
							});
							d = '';
							for(i = 0; i < c.length; i++){
								for(j = 0; j < c[i].length; j++){
									this.bbox.expand(c[i][j]);
									xy = latlon2xy(c[i][j][1],c[i][j][0],map.zoom);
									lat = (90 - c[i][j][1]).toFixed(5);
									lon = (c[i][j][0]).toFixed(5);
									if(j==0) d += 'M'+xy.x+' '+xy.y;
									else d += (j==1 ? 'L':', ')+xy.x+' '+xy.y;
								}
							}
							setAttr(p,{
								'd':d,
								'fill':'transparent',
								'vector-effect':'non-scaling-stroke'
							});
							if(typeof attr.style==="function") attr.style.call(this,feature,p);
						}else if(feature.geometry.type == "Point"){
							this.bbox.expand(c);
							xy = latlon2xy(c[1],c[0],map.zoom);

							p = svgEl('text');
							tspan = svgEl('tspan');
							tspan.innerHTML = feature.name;
							p.appendChild(tspan);
							setAttr(p,{
								'fill': this.options.fill||this.options.color,
								'fill-opacity': this.options.fillOpacity,
								'font-weight': this.options['font-weight']||'',
								'stroke': this.options.stroke||this.options.color,
								'stroke-width': this.options['stroke-width']||'0.4%',
								'stroke-linejoin': this.options['stroke-linejoin'],
								'text-anchor': this.options.textAnchor||'middle',
								'font-size': (feature.properties.fontsize ? feature.properties.fontsize : 1),
								'paint-order': 'stroke',
								'x': xy.x,
								'y': xy.y
							});
							if(typeof attr.style==="function") attr.style.call(this,feature,p);
						}
						g.appendChild(p);
					}
				}
			}else{
				console.warn('No data features',this.data);
			}
			return this;
		};
		
		this.load = function(){
			if(!this.data){
				// Load the file
				fetchFile(this._url,{'this':this,'type':attr.type||'json'},function(d){
					this.data = d;
					if(typeof attr.process==="function") attr.process.call(this,d,map);
					this.update();
					// Final callback
					if(typeof attr.callback==="function") attr.callback.call(map);
				});
			}else{
				this.update();
				// Final callback
				if(typeof attr.callback==="function") attr.callback.call(map);
			}
		};

		return this;
	}

	function BBox(lat,lon){
		this.lat = lat||{'min':90,'max':-90};
		this.lon = lon||{'max':-180,'min':180};
		this.expand = function(c){
			if(c.length == 2){
				this.lat.max = Math.max(this.lat.max,c[1]);
				this.lat.min = Math.min(this.lat.min,c[1]);
				this.lon.max = Math.max(this.lon.max,c[0]);
				this.lon.min = Math.min(this.lon.min,c[0]);
			}else if(c.lat && c.lon){
				this.lat.max = Math.max(this.lat.max,c.lat.max);
				this.lat.min = Math.min(this.lat.min,c.lat.min);
				this.lon.max = Math.max(this.lon.max,c.lon.max);
				this.lon.min = Math.min(this.lon.min,c.lon.min);
			}else{
				console.warn('updateBBox wrong shape',c);
			}
			return this;
		};
		this.asTile = function(zoom){
			var x = {'min':lon2tile(this.lon.min,zoom),'max':lon2tile(this.lon.max,zoom)};
			var y = {'min':lat2tile(this.lat.min,zoom),'max':lat2tile(this.lat.max,zoom)};
			x.range = Math.abs(x.max-x.min);
			y.range = Math.abs(y.max-y.min);
			return {'x':x,'y':y };
		};
		return this;
	}

	// Map maths for the Web Mercator projection (like Open Street Map) e.g. https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
	var d2r = Math.PI/180;
	function lon2tile(lon,zoom){ return ((lon+180)/360)*Math.pow(2,zoom); }
	function lat2tile(lat,zoom){ return ((1-Math.log(Math.tan(lat*d2r) + 1/Math.cos(lat*d2r))/Math.PI)/2)*Math.pow(2,zoom); }
	function latlon2xy(lat,lon,zoom){ return {'x':lon2tile(lon,zoom),'y':lat2tile(lat,zoom)}; }

	// Export the function
	OI.BasicMap = function(el,attr){ return new BasicMap(el,attr); };

	// Make a tiny file loading manager so that we don't make multiple requests for the same large files
	var files = {};
	function fetchFile(file,attr,fn){
		if(!file) return;
		if(!attr) attr = {};
		if(!attr.type) attr.type = "text";
		if(!files[file]) files[file] = {'status':'','callbacks':[]};
		files[file].callbacks.push({'attr':attr,'fn':fn});

		// The contents of this file have already been fetched.
		if(files[file].status == 'loaded'){
			return files[file].data;
		}else if(files[file].status == ''){
			files[file].status = 'loading';
			console.info('Downloading '+file);

			// Fetch the HTML code of this file.
			fetch(file).then(response => {
				if(!response.ok) throw new Error('Network response was not OK');
				return (attr.type=="json" ? response.json() : response.text());
			}).then(function (data) {
				// Save the HTML code of this file in the files array,
				// so we won't need to fetch it again.
				files[file].status = 'loaded';
				files[file].data = data;
				// Run any callbacks attached to this file
				for(var c = 0; c < files[file].callbacks.length; c++){
					if(typeof files[file].callbacks[c].fn==="function") files[file].callbacks[c].fn.call(files[file].callbacks[c].attr.this||this,data);
				}
			}).catch(error => {
				console.error('Unable to load the file '+file,error);
			});
		}
	}
	root.OI = OI;
})(window || this);