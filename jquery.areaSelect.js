/**
 * Created by gongshw on 14/12/9.
 *
 * Updated by zhangfucheng on 16/8/9.
 */
(function ($, undefined) {

	console.log('jquery.areaSelect.js by Gongshw https://github.com/gongshw/jquery.areaSelect.js');
	console.log('modified by zhangfucheng https://github.com/zeplios/jquery.areaSelect.js');

	var AreaSelectStatus = {CREATE: 'create', MOVE: 'move', RESIZE: 'resize', NEAR: 'near'};
	var AreaSelectType = {RECT: 'rect', ELLIPSE: 'ellipse'};
	var Direction = {
		NE: {name: 'NE', x: 1, y: -1, cursor: 'nesw-resize', idx: 1},
		NW: {name: 'NW', x: -1, y: -1, cursor: 'nwse-resize', idx: 0},
		SE: {name: 'SE', x: 1, y: 1, cursor: 'nwse-resize', idx: 2},
		SW: {name: 'SW', x: -1, y: 1, cursor: 'nesw-resize', idx: 3}
	};
	var DeleteMethod = {CLICK: 'click', DOUBLE_CLICK: 'doubleClick'};

	function createCanvasOverComponent(comp, zIndex) {
		var $obj = $(comp);
		var $canvas = $('<canvas/>');
		$canvas.attr('width', $obj.width())
			.attr('height', $obj.height())
			.offset($obj.position())
			.css({position: "absolute", zIndex: zIndex})
			.appendTo($obj.parent());
		return $canvas[0];
	}

	function createCanvas(width, height) {
		var $canvas = $('<canvas/>');
		$canvas.attr('width', width)
			.attr('height', height);
		return $canvas[0];
	}

	function AreaSelect($comp, options) {
		this.base = $comp[0];
		this.init();
		this.areas = Array();
		this.maskCanvases = Array();
		this.options = options;
		this.status = AreaSelectStatus.CREATE;
		this.dragging = false;
		this.resizeDirection = null;
		this.dragAreaOffset = {};
		if (options.initAreas) {
			for (var index in options.initAreas) {
				var mCanvas = createCanvasOverComponent(this.base, 10);
				$(mCanvas).css('display', 'none');
				var area = options.initAreas[index];
				if (area.type == AreaSelectType.RECT) {
					this.maskCanvases.push(mCanvas);
					this.areas.push(new RectArea(area.x, area.y, area.width, area.height));
				} else if (area.type == AreaSelectType.ELLIPSE) {
					this.maskCanvases.push(mCanvas);
					this.areas.push(new EllipseArea(area.x, area.y, area.r1, area.r2, area.angle));
				}
				
			}
		}
		this.draw();
	}

	AreaSelect.prototype.get = function () {
		var canvases = Array();
		for (var i in this.areas) {
			canvases.push(this.areas[i].getAreas(this.base, this.maskCanvases[i]));
		}
		return canvases;
	};

	AreaSelect.prototype.bindChangeEvent = function (handle) {
		$(this.canvas).on("areasChange", handle[0]);
	};

	AreaSelect.prototype.init = function () {
		var canvas = createCanvasOverComponent(this.base, 1000000);
		this.canvas = canvas;
		var as = this;
		var moveDownPoint = {};

		$(canvas).mousemove(function (event) {
			var offsetX = get_offset_X(event);
			var offsetY = get_offset_Y(event);
			if (as.dragging) {
				as.onDragging(offsetX, offsetY);
			} else {
				as.onMouseMoving(offsetX, offsetY);
			}
		}).mousedown(function (event) {
			moveDownPoint = {x: get_offset_X(event), y: get_offset_Y(event)};
			as.onDragStart(get_offset_X(event), get_offset_Y(event));
		}).mouseup(function (event) {
			if (get_offset_X(event) == moveDownPoint.x && get_offset_Y(event) == moveDownPoint.y) {
				as.onClick(get_offset_X(event), get_offset_Y(event));
			}
			as.onDragStop(event);
		}).dblclick(function (event) {
			as.onDoubleClick(get_offset_X(event), get_offset_Y(event));
		});
	};

	AreaSelect.prototype.onDragStart = function (x, y) {
		this.dragging = true;
		switch (this.status) {
			case AreaSelectStatus.RESIZE:
				!this.currentArea || setAreaDirection(this.currentArea, this.resizeDirection);
				break;
			case AreaSelectStatus.MOVE:
				this.dragAreaOffset = {x: this.currentArea.x - x, y: this.currentArea.y - y};
				break;
			case AreaSelectStatus.CREATE:
				var canvas = createCanvasOverComponent(this.base, 10);
				$(canvas).css('display', 'none');
				var newArea = new RectArea(x, y, 0, 0);
				this.maskCanvases.push(canvas);
				this.areas.push(newArea);
				this.currentArea = newArea;
				this.status = AreaSelectStatus.RESIZE;
				break;
		}
	};

	AreaSelect.prototype.onDragStop = function (event) {
		this.dragging = false;
		switch (this.status) {
			case AreaSelectStatus.RESIZE:
				if (this.currentArea != undefined) {
					if (this.currentArea.checkValid()) {
						setAreaDirection(this.currentArea, Direction.SE);
						if (this.options.type == AreaSelectType.ELLIPSE || event.ctrlKey) {
							var x = this.currentArea.x, y = this.currentArea.y;
							var w = this.currentArea.width, h = this.currentArea.height;
							var newArea = new EllipseArea(x + w/2, y + h/2,	w/2, h/2, 0);
							var index = this.deleteArea(this.currentArea);
							var canvas = this.maskCanvases.splice(index, 1)[0];
							this.currentArea = newArea;
							this.areas.push(newArea);
							this.maskCanvases.push(canvas);
						}
						this.triggerChange();
					} else {
						var index = this.deleteArea(this.currentArea);
						this.maskCanvases.splice(index, 1);
						this.currentArea = undefined;
						this.status = AreaSelectStatus.CREATE;
					}
				}
				break;
			case AreaSelectStatus.MOVE:
				this.triggerChange();
				break;
		}
	};

	AreaSelect.prototype.onMouseMoving = function (x, y) {
		var area = this.getArea(x, y, this.options.padding);
		var $canvas = $(this.canvas);
		if (area != undefined) {
			this.currentArea = area;
			var nearDrag = false;
			var dragDirection = null;
			var dragPoints = area.getPositionPoints();
			for (var d in dragPoints) {
				if (near({x: x, y: y}, dragPoints[d], this.options.padding)) {
					nearDrag = true;
					dragDirection = Direction[d];
					break;
				}
			}
			if (nearDrag) {
				$canvas.css({cursor: dragDirection.cursor});
				this.status = AreaSelectStatus.RESIZE;
				this.resizeDirection = dragDirection;
			} else if (this.getArea(x, y, -this.options.padding) != undefined) {
				$canvas.css({cursor: 'move'});
				this.status = AreaSelectStatus.MOVE;
			} else {
				$canvas.css({cursor: 'auto'});
				this.status = AreaSelectStatus.NEAR;
			}
		} else {
			this.currentArea = undefined;
			$canvas.css({cursor: 'default'});
			this.status = AreaSelectStatus.CREATE;
		}
		this.draw();
	};

	AreaSelect.prototype.onDragging = function (x, y) {
		var area = this.currentArea;
		switch (this.status) {
			case AreaSelectStatus.RESIZE:
				area.updateSize(this, x, y);
				break;
			case AreaSelectStatus.MOVE:
				area.x = (x + this.dragAreaOffset.x);
				area.y = (y + this.dragAreaOffset.y);
				break;
			case AreaSelectStatus.CREATE:
				break;
		}
		this.draw();
	};


	AreaSelect.prototype.onDoubleClick = function (x, y) {
		var area = this.getArea(x, y, this.options.padding);
		if (area != undefined && this.options.deleteMethod == DeleteMethod.DOUBLE_CLICK) {
			this.deleteArea(area);
			this.draw();
		}
	};

	AreaSelect.prototype.onClick = function (x, y) {
		var area = this.getArea(x, y, this.options.padding);
		if (area != undefined && this.options.deleteMethod == DeleteMethod.CLICK) {
			this.deleteArea(area);
			this.draw();
		}
	};

	AreaSelect.prototype.draw = function () {
		var g2d = this.canvas.getContext('2d');
		/* clear canvas */
		g2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
		/* draw areas */
		g2d.strokeStyle = this.options.area.strokeStyle;
		g2d.lineWidth = this.options.area.lineWidth;
		for (var index in this.areas) {
			var area = this.areas[index];
			area.draw(this.canvas, this.maskCanvases[index]);
		}
		/* draw current area */
		var area = this.currentArea;
		g2d.fillStyle = this.options.point.fillStyle;
		if (area != undefined) {
			area.drawControlPoints(this, g2d);
		}
	};

	AreaSelect.prototype.deleteArea = function (area) {
		var areas = this.areas;
		var index = areas.indexOf(area);
		if (index >= 0) {
			areas.splice(index, 1);
			this.currentArea = undefined;
			this.triggerChange();
			this.status = AreaSelectStatus.CREATE;
		}
		return index;
	};

	AreaSelect.prototype.getArea = function (x, y, padding) {
		for (var index in this.areas) {
			var area = this.areas[index];
			if (area.isInArea(x, y, padding)) {
				return area;
			}
		}
		return undefined;
	};

	AreaSelect.prototype.triggerChange = function () {
		$(this.canvas).trigger("areasChange", {areas: this.get()});
	};

	var setAreaDirection = function (area, direction) {
		if (area != undefined && direction != undefined) {
			area.setAreaDirection(direction);
		}
	};

	var getAngle = function (basex, basey, x, y) {
		var dx = Math.abs(basex - x);
		var dy = Math.abs(basey - y);
		if (x < basex && y <= basey) {
			return Math.atan(dy / dx);
		} else if (x > basex && y <= basey) {
			return Math.PI - Math.atan(dy / dx);
		} else if (x > basex && y > basey) {
			return Math.PI + Math.atan(dy / dx);
		} else if (x < basex && y > basey) {
			return 2 * Math.PI - Math.atan(dy / dx);
		} else if (y <= basey) {
			return Math.PI / 2;
		} else {
			return 3 * Math.PI / 2;
		}
	};

	var near = function (point1, point2, s) {
		return Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2) <= Math.pow(s, 2);
	};

	var get_offset_X = function (event) {
		return event.offsetX ? event.offsetX : event.originalEvent.layerX;
	};

	var get_offset_Y = function (event) {
		return event.offsetY ? event.offsetY : event.originalEvent.layerY;
	};

	function RectArea(x, y, width, height) {
		this.type = 'rect';
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
	}

	RectArea.prototype.draw = function(canvas, maskCanvas) {
		canvas.getContext('2d').strokeRect(this.x, this.y, this.width, this.height);
	}

	RectArea.prototype.drawControlPoints = function(as, g2d) {
		var positionPoints = this.getPositionPoints();
		/* draw position point */
		for (var index in positionPoints) {
			var point = positionPoints[index];
			g2d.beginPath();
			g2d.arc(point.x, point.y, as.options.point.size, 0, Math.PI * 2, true);
			g2d.closePath();
			g2d.fill();
		}
	}

	RectArea.prototype.getPositionPoints = function () {
		var points = {};
		for (var d in Direction) {
			points[d] = {
				x: this.x + this.width * (Direction[d].x + 1) / 2,
				y: this.y + this.height * (Direction[d].y + 1) / 2
			};
		}
		return points;
	};

	RectArea.prototype.isInArea = function (x, y, padding) {
		padding = padding === undefined ? 0 : padding;
		var abs = Math.abs;
		var x1 = this.x;
		var x2 = this.x + this.width;
		var y1 = this.y;
		var y2 = this.y + this.height;
		if (padding >= 0 && abs(x1 - x) + abs(x2 - x) - abs(this.width) <= padding * 2
			&& abs(y1 - y) + abs(y2 - y) - abs(this.height) <= padding * 2) {
			return true;
		}
		if (padding < 0
			&& abs(x1 - x) + abs(x2 - x) - abs(this.width) == 0
			&& abs(y1 - y) + abs(y2 - y) - abs(this.height) == 0
			&& abs(abs(x1 - x) - abs(x2 - x)) <= abs(this.width) + 2 * padding
			&& abs(abs(y1 - y) - abs(y2 - y)) <= abs(this.height) + 2 * padding) {
			return true;
		}
		return false;
	};

	RectArea.prototype.setAreaDirection = function(direction) {
		var x1 = this.x;
		var x2 = this.x + this.width;
		var y1 = this.y;
		var y2 = this.y + this.height;
		var width = Math.abs(this.width);
		var height = Math.abs(this.height);
		var minOrMax = {'1': Math.min, '-1': Math.max};
		this.x = minOrMax[direction.x](x1, x2);
		this.y = minOrMax[direction.y](y1, y2);
		this.width = direction.x * width;
		this.height = direction.y * height;
	}

	RectArea.prototype.updateSize = function(as, x, y) {
		this.width = x - this.x;
		this.height = y - this.y;
		if (as.options.fixRatio) {
			var widthToHeight = Math.abs(this.width) / Math.abs(this.height);
			if (widthToHeight < 1) {
				this.height = this.height * widthToHeight;
			} else {
				this.width = this.width / widthToHeight;
			}
		}
	}

	RectArea.prototype.checkValid = function() {
		return this.width > 0 && this.height > 0;
	}

	RectArea.prototype.getAreas = function(component, maskCanvas) {
		var newCanvas = createCanvas(this.width, this.height);
		var newG2d = newCanvas.getContext("2d");
		newG2d.drawImage(component, -this.x, -this.y);
		return newCanvas;
	}

	function EllipseArea(x, y, r1, r2, angle) {
		this.type = 'ellipse';
		this.x = x; // center x
		this.y = y;
		this.r1 = r1; // horizontal axis
		this.r2 = r2;
		this.angle = angle ? angle : 0;
	}

	EllipseArea.prototype.draw = function(canvas, maskCanvas) {
		var g2d_mask = maskCanvas.getContext('2d');
		g2d_mask.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
		var r = this.r1 > this.r2 ? this.r1 : this.r2;
		var ratioX = this.r1 / r;
		var ratioY = this.r2 / r;

		var sin = Math.sin(this.angle);
		var cos = Math.cos(this.angle);

		var g2d = canvas.getContext('2d');
		g2d.beginPath();
		g2d.translate(this.x, this.y);
		g2d.rotate(this.angle);
		g2d.translate(-this.x, -this.y);
		g2d.scale(ratioX, ratioY);
		g2d.arc(this.x / ratioX, this.y / ratioY, r, 0, 2 * Math.PI);
		g2d.closePath(); 
		g2d.stroke();
		g2d.scale(1 / ratioX, 1 / ratioY);
		g2d.translate(this.x, this.y);
		g2d.rotate(-this.angle);
		g2d.translate(-this.x, -this.y);
		g2d.beginPath();
		g2d.moveTo(this.x-this.r1*cos, this.y-this.r1*sin);
		g2d.lineTo(this.x+this.r1*cos, this.y+this.r1*sin);
		g2d.moveTo(this.x-this.r2*sin, this.y+this.r2*cos);
		g2d.lineTo(this.x+this.r2*sin, this.y-this.r2*cos);
		g2d.closePath(); 
		g2d.stroke();


		g2d_mask.beginPath();
		g2d_mask.translate(this.x, this.y);
		g2d_mask.rotate(this.angle);
		g2d_mask.translate(-this.x, -this.y);
		g2d_mask.scale(ratioX, ratioY);
		g2d_mask.arc(this.x / ratioX, this.y / ratioY, r, 0, 2 * Math.PI);
		g2d_mask.closePath(); 
		g2d_mask.fill();
		g2d_mask.scale(1 / ratioX, 1 / ratioY);
		g2d_mask.translate(this.x, this.y);
		g2d_mask.rotate(-this.angle);
		g2d_mask.translate(-this.x, -this.y);
	}

	EllipseArea.prototype.drawControlPoints = function(as, g2d) {
		var positionPoints = this.getPositionPoints();
		/* draw position point */
		for (var index in positionPoints) {
			var point = positionPoints[index];
			g2d.beginPath();
			g2d.arc(point.x, point.y, as.options.point.size, 0, Math.PI * 2, true);
			g2d.closePath();
			g2d.fill();
		}
	}

	EllipseArea.prototype.getPositionPoints = function () {
		var points = {};
		var sin = Math.sin(this.angle);
		var cos = Math.cos(this.angle);
		var ps = Array(4);
		ps[0] = {x:this.x-this.r1*cos, y:this.y-this.r1*sin};
		ps[1] = {x:this.x+this.r1*cos, y:this.y+this.r1*sin};
		ps[2] = {x:this.x-this.r2*sin, y:this.y+this.r2*cos};
		ps[3] = {x:this.x+this.r2*sin, y:this.y-this.r2*cos};
		for (var i in ps) {
			var angle = getAngle(this.x, this.y, ps[i].x, ps[i].y);
			if (angle < Math.PI / 2) {
				points['NW'] = ps[i];
			} else if (angle < Math.PI) {
				points['NE'] = ps[i];
			} else if (angle < 3 * Math.PI / 2) {
				points['SE'] = ps[i];
			} else {
				points['SW'] = ps[i];
			}
		}
		return points;
	};

	EllipseArea.prototype.isInArea = function (x, y, padding) {
		padding = padding === undefined ? 0 : padding;
		var angle = getAngle(this.x, this.y, x, y) - this.angle;
		while (angle >= Math.PI) angle -= Math.PI;
		while (angle < 0) angle += Math.PI;
		if (angle > Math.PI / 2) {
			angle = Math.PI - angle;
		}
		var distance = Math.pow(this.x - x, 2) + Math.pow(this.y - y, 2);
		var baseline = this.r1 * Math.pow(Math.cos(angle), 2) + this.r2 * Math.pow(Math.sin(angle), 2);
		return distance < Math.pow(baseline, 2);
	};

	EllipseArea.prototype.setAreaDirection = function(direction) {
		if (this.angle >= 0 && this.angle < Math.PI / 2) {
			this.direction = direction.idx;
		} else if (this.angle >= Math.PI / 2 && this.angle < Math.PI) {
			this.direction = (direction.idx + 3) % 4;
		} else if (this.angle >= Math.PI && this.angle < 3 * Math.PI / 2) {
			this.direction = (direction.idx + 2) % 4;
		} else {
			this.direction = (direction.idx + 1) % 4;
		}
	}

	EllipseArea.prototype.updateSize = function(as, x, y) {
		var dx2 = Math.pow(this.x - x, 2);
		var dy2 = Math.pow(this.y - y, 2);
		if (this.direction == 0 || this.direction == 2) {
			this.r1 = Math.sqrt(dx2 + dy2);
			this.angle = Math.atan((this.y-y) / (this.x-x));
		} else {
			this.r2 = Math.sqrt(dx2 + dy2);
			this.angle = Math.atan((this.y-y) / (this.x-x));
		}
		if (as.options.fixRatio) {
			if (this.r1 > this.r2) {
				this.r1 = this.r2;
			} else {
				this.r2 = this.r1;
			}
		}
		this.angle = getAngle(this.x, this.y, x, y) - this.direction * Math.PI / 2;
		while (this.angle < 0) this.angle += 2 * Math.PI;
		while (this.angle >= 2 * Math.PI) this.angle -= 2 * Math.PI;
	}

	EllipseArea.prototype.checkValid = function() {
		return this.r1 > 0 && this.r2 > 0;
	}

	EllipseArea.prototype.getAreas = function(component, maskCanvas) {
		var maskG2d = maskCanvas.getContext('2d');
		var width = maskCanvas.width;
		var height = maskCanvas.height;
		var maskData = maskG2d.getImageData(0, 0, width, height);

		// find bounds
		var xmax = 0, xmin = width, ymax = 0, ymin = height;
		for (var i = 0 ; i < width ; i++) {
			for (var j = 0 ; j < height ; j++) {
				var pos = i + j * width;
				var val = maskData.data[pos*4+3];
				if (val == 255) {
					if (i > xmax) xmax = i;
					if (i < xmin) xmin = i;
					if (j > ymax) ymax = j;
					if (j < ymin) ymin = j;
				}
			}
		}

		var nWidth = xmax - xmin + 1;
		var nHeight = ymax - ymin + 1;
		var newCanvas = createCanvas(nWidth, nHeight);
		var newG2d = newCanvas.getContext("2d");

		var baseCanvas = createCanvas($(component).width(), $(component).height());
		var baseG2d = baseCanvas.getContext('2d');
    	baseG2d.drawImage(component, 0, 0);
    	
		var baseData;
		try {
			baseData = baseG2d.getImageData(0, 0, width, height);
		} catch (e) {
			newG2d.drawImage(component, -xmin, -ymin);
			return newCanvas;
		}

		
		var newData = newG2d.createImageData(nWidth, nHeight);
		for (var i = 0 ; i < nWidth ; i++) {
			for (var j = 0 ; j < nHeight ; j++) {
				var pos = (i + xmin) + (j + ymin) * width;
				var nPos = i + j * nWidth;
				var val = maskData.data[pos*4+3];
				if (val == 255) {
					newData.data[nPos*4] = baseData.data[pos*4];
					newData.data[nPos*4+1] = baseData.data[pos*4+1];
					newData.data[nPos*4+2] = baseData.data[pos*4+2];
					newData.data[nPos*4+3] = baseData.data[pos*4+3];
				}
			}
		}
		newG2d.putImageData(newData, 0, 0);
		return newCanvas;
	}


	$.fn.areaSelect = function (method) {
		var as;
		var defaultOptions = {
			initAreas: [],
			deleteMethod: 'click',//or doubleClick
			padding: 5,
			area: {strokeStyle: 'red', lineWidth: 2},
			point: {size: 3, fillStyle: 'black'}, 
			fixRatio: false, 
			type: 'rect'
		};
		as = this.data('AreaSelect');
		if (as == undefined && (method === undefined || $.isPlainObject(method))) {
			var options = $.extend({}, defaultOptions, method);
			as = new AreaSelect(this, options);
			this.data('AreaSelect', as);
		} else {
			if (as === undefined) {
				console.error('pls invoke areaSelect() on this element first!');
			} else if (as[method] != undefined) {
				return as[method](Array.prototype.slice.call(arguments, 1));
			} else {
				console.error('no function ' + method);
			}
		}
	}

})(jQuery);

