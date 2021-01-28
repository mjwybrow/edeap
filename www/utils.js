var downloadName = "edeap.svg";

var areaSpecification;
var width;
var height;
var canvasWidth;
var canvasHeight;
var translateX = 0;
var translateY = 0;
var scaling = 100;
var showSetLabels = true;
var showIntersectionValues = true;
var colourPaletteName = "Tableau10";
var defaultLabelFontSize = 12;
var defaultValueFontSize = 12;
var labelFontSize = "12pt";
var valueFontSize = "12pt";

var globalContours = []; // size of number of ellipses
var globalZones = []; // size of number of intersections
var globalZoneStrings = []; // size of number of intersections, string version of globalZones
var globalOriginalProportions = []; // proportions before scaling, size of number of intersections
var globalProportions = []; // proportions after scaling, size of number of intersections
var globalOriginalContourAreas = new Array(); // size of number of ellipses
var globalContourAreas = []; // size of number of ellipses
var globalLabelWidths = []; // size of number of ellipses
var globalLabelHeights = []; // size of number of intersections
var globalValueWidths = []; // size of number of intersections
var globalValueHeights = []; // size of number of intersections
var globalAbstractDescription;

var globalZoneAreaTableBody = ""; // to access table output from updateZoneAreaTable, not terribly elegant
var globalFinalFitness = -1; // access to fitness after optimizer has finished

	function setupGlobal(areaSpecificationText) {

		globalContours = [];
		globalZones = [];
		globalZoneStrings = [];
		globalOriginalProportions = [];
		globalProportions = [];
		globalOriginalContourAreas = [];
		globalContourAreas = [];
		globalLabelWidths = [];
		globalLabelHeights = [];
		globalValueWidths = [];
		globalValueHeights = [];

		ellipseParams = [];
		ellipseLabel = [];
		ellipseArea = [];


		globalAbstractDescription = decodeAbstractDescription(areaSpecificationText);
		globalContours = findContours(globalAbstractDescription);
		globalZones = findZones(globalAbstractDescription);

		if(globalContours.length === 0) {
			return;
		}

		globalProportions = findProportions(globalZones);
		globalZones = removeProportions(globalZones);

		function onlyUnique(value, index, self) {
		    return self.indexOf(value) === index;
		}

		// remove zero zones and proportions
		var removeList = new Array();
		for (var i=0; i < globalProportions.length; i++) {
			var proportion = globalProportions[i];
			var problem = false;
			let lineNum = i + 1;

			let globalZonesString = JSON.stringify(globalZones[i]);
			if (JSON.stringify(globalZones[i].filter(onlyUnique)) != globalZonesString)
			{
				console.log("ERROR:    " + lineNum + ": Zone description has duplicated labels: ");
				console.log("          " + globalZones[i].join(" ") + " " + proportion);
			}

			for (var j=0; j < i; j++) {
				if (globalZonesString == JSON.stringify(globalZones[j])) {
					if (globalProportions[i] != globalProportions[j]) {
						console.log("ERROR:    " + lineNum + ": Duplicated zone doesn't match previous area ("+ globalProportions[j] + "): ");
						console.log("          " + globalZones[i].join(" ") + " " + proportion);
					}
					else {
						console.log("WARNING:  " + lineNum + ": Unnecessary duplicated zone: ");
						console.log("          " + globalZones[i].join(" ") + " " + proportion);
					}
					removeList.push(i);
					problem = true;
					break;
				}
			}
			if (proportion === 0.0 && !problem) {
				console.log("WARNING: " + lineNum + ": Unnecessary empty zone: ");
				console.log("          " + globalZones[i].join(" ") + " " + proportion);
				removeList.push(i);
				continue;
			}
		}
		for (var i=removeList.length-1; i >= 0; i--) {
			var index = removeList[i];
			globalProportions.splice(index,1);
			globalZones.splice(index,1);
		}

		globalContours = findContoursFromZones(globalZones);

		// values are before scaling
		globalOriginalContourAreas = findContourAreas();

		var totalArea = 0.0;
		for(var i=0; i < globalProportions.length; i++) {
			totalArea = totalArea+globalProportions[i];
		}

		scalingValue = 1/totalArea;

		globalOriginalProportions = new Array();
		for(var i=0; i < globalProportions.length; i++) {
			globalOriginalProportions[i] = globalProportions[i];
			globalProportions[i] = globalProportions[i]*scalingValue;
		}

		// called again to get values after scaling
		globalContourAreas = findContourAreas();

// sort zone into order of ellipses as in the global ellipse list
		globalZoneStrings = new Array();
		for(var j=0; j < globalZones.length; j++) {
			var zone = globalZones[j];
			var sortedZone = new Array();
			var zonePosition = 0;
			for(var i=0; i < globalContours.length; i++) {
				var contour = globalContours[i];
				if(zone.indexOf(contour) != -1) {
					sortedZone[zonePosition] = contour;
					zonePosition++;
				}
			}
//			globalZones[j] = sortedZone;
			var sortedZoneString = sortedZone.toString();
			globalZoneStrings[j] = sortedZoneString;
		}



	}


	function generateInitialLayout() {

		var x = 1;
		var y = 1;
		var increment = 0.3;

		for(var i=0; i < globalContourAreas.length; i++) {
			var area = globalContourAreas[i];
			var radius = Math.sqrt(area/Math.PI); // start as a circle
			ellipseParams[i] = {
				X: x,
				Y: y,
				A: radius,
				B: radius,
				R: 0
			};
			ellipseLabel[i] = globalContours[i];
			ellipseArea[i] = area;

			//x = x+increment;
		}

		// Check for ellipses that must be the same:
	    ellipseDuplication = [];
	    duplicatedEllipseIndexes = [];
	    ellipseEquivilenceSet = [];
	    let ellipseEquivilenceSetCount = 0;
	    for (let indexA = 0; indexA < ellipseLabel.length; ++indexA)
	    {
	        if (ellipseDuplication[indexA] != undefined) {
	            // Already processed.
	            continue;
	        }

	        let count = 1;
	        let zonesWithA = globalZones.filter(function(element) { return element.includes(ellipseLabel[indexA]); }).join("#");
	        for (let indexB = indexA + 1; indexB < ellipseLabel.length; ++indexB)
	        {
	            let zonesWithB = globalZones.filter(function(element) { return element.includes(ellipseLabel[indexB]); }).join("#");
	            if (zonesWithA === zonesWithB)
	            {
	                if (typeof ellipseEquivilenceSet[zonesWithA] === 'undefined')
	                {
	                    ellipseEquivilenceSetCount++;
	                    console.log("Eqivalence set " + ellipseEquivilenceSetCount);
	                    ellipseEquivilenceSet[zonesWithA] = ellipseEquivilenceSetCount;
	                    console.log(" -- " + ellipseLabel[indexA]);
	                }
	                ellipseEquivilenceSet[zonesWithB] = ellipseEquivilenceSetCount;
	                console.log(" -- " + ellipseLabel[indexB]);

	                // Set ellipse B as a duplicate of ellipse A
	                ellipseParams[indexB] = ellipseParams[indexA];
	                duplicatedEllipseIndexes.push(indexB);

	                count++;
	                ellipseDuplication[indexB] = count;
	            }
	        }
	    }
	}

	function generateInitialRandomLayout(maxX,maxY) {
		var x = 0;
		var y = 0;
		var increment = 0.3;

		for(var i=0; i < globalContourAreas.length; i++) {
			var area = globalContourAreas[i];
			var radius = Math.sqrt(area/Math.PI) // start as a circle
			ellipseParams[i] = {
				X: Math.random()*maxX,
				Y: Math.random()*maxY,
				A: radius,
				B: radius,
				R: 0
			};
			ellipseLabel[i] = globalContours[i];
			ellipseArea[i] = area;

			//x = x+increment;
		}

	}



	function findContourAreas() {
		var contourAreas = new Array();
		for(var i=0; i < globalContours.length; i++) {
			var sum = 0;
			for(var j=0; j < globalZones.length; j++) {
				if(globalZones[j].indexOf(globalContours[i]) != -1) {
					sum = sum+globalProportions[j];
				}
			}
			contourAreas[i] = sum;
		}

		return contourAreas;
	}


	function distanceBetweenNodes(node1, node2)
	{
        let xDifferenceSquared = Math.pow(node1.x - node2.x, 2);
        let yDifferenceSquared = Math.pow(node1.y - node2.y, 2);

        let sumOfSquaredDifferences = xDifferenceSquared +
                yDifferenceSquared;

        let distance = Math.sqrt(sumOfSquaredDifferences);

        return distance;
	}

	function ellipseBoundaryPosition(eA, eB, eR, angleRad)
	{
		let divisor = Math.sqrt(Math.pow(eB * Math.cos(angleRad), 2) + Math.pow(eA * Math.sin(angleRad), 2))
		let y = (eA * eB * Math.sin(angleRad)) / divisor;
		let x = (eA * eB * Math.cos(angleRad)) / divisor;

		/*
		let x = (eA * eB) / Math.sqrt(Math.pow(eB, 2) + Math.pow(eA, 2) * Math.pow(Math.tan(angleRad), 2));
		if (angleRad < Math.PI * 1.5 && angleRad >= Math.PI/2)
		{
			x *= -1;
		}
		let y = Math.sqrt(1 - Math.pow(x/eA, 2)) * eB;
		if (angleRad < Math.PI)
		{
			y *= -1;
		}
		if (isNaN(x)) {
			console.log("NAN X: " + eA + ", " + eB + ", " + eR);
		}
		if (isNaN(y)) {
			console.log("NAN X: " + eA + ", " + eB + ", " + eR);
		}
		*/

		if (eR > 0) {
			let s = Math.sin(eR);
			let c = Math.cos(eR);


			let newX = x * c - y * s;
			let newY = x * s + y * c;

			x = newX;
			y = newY;
		}

		return {
			x,
			y
		};
	}

	// generate svg from ellipses
	function generateSVG(width, height, setLabels, intersectionValues, translateX, translateY, scaling, areas, forDownload) {
		if (typeof areas === "undefined") {
			areas = new EdeapAreas();
		}
		if (typeof forDownload === "undefined") {
			// If not specified, assume not for download.
			forDownload = false;
		}

		var svgString = '';

		if (forDownload) {
			// Prolog is only needed for when in a standalone file.
			svgString + '<?xml version="1.0" standalone="no"?>';
			svgString += '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">';
		}

		svgString += '<svg width="'+width+'" height="'+height+'" xmlns="http://www.w3.org/2000/svg">\n';

		const N = areas.ellipseLabel.length;
		for (var i=0; i < N; i++) {
			var color = findColor(i);
			var eX = (areas.ellipseParams[i].X+translateX)*scaling;
			var eY = (areas.ellipseParams[i].Y+translateY)*scaling;
			var eA = areas.ellipseParams[i].A*scaling;
			var eB = areas.ellipseParams[i].B*scaling;

			var eR = areas.ellipseParams[i].R.toDegrees();
			nextSVG ='<ellipse cx="'+eX+'" cy="'+eY+'" rx="'+eA+'" ry="'+eB+'" fill="' + color +'" fill-opacity="0.075" stroke="'+color+'" stroke-width="'+2+'" transform="rotate('+eR+' '+eX+' '+eY+' '+')" />'+"\n";
			svgString += nextSVG;
		}

		if (setLabels) {
			const LABEL_DEBUGGING = false;

			// Find positions for ellipses, one at a time.
			let angleRange = Math.PI * 2;
			let ranges = [];
			for (var i=0; i < N; i++) {
				var color = findColor(i);

				var eX = (areas.ellipseParams[i].X+translateX)*scaling;
				var eY = (areas.ellipseParams[i].Y+translateY)*scaling;
				var eA = areas.ellipseParams[i].A*scaling;
				var eB = areas.ellipseParams[i].B*scaling;
				let eR = areas.ellipseParams[i].R

				let minDepth = Number.MAX_SAFE_INTEGER;
				let maxDepth = 0;

				// Compute the depth of each boundary point (i.e., how many
			    // other ellipses it is within.)
				var ellipseRanges = [];
				var currentRange = null;
				ranges[i] = ellipseRanges;
				for (let angle = 0; angle < 360; angle += 10) {
					let angleRad = angle.toRadians();
					let {x, y} = ellipseBoundaryPosition(eA, eB, eR, angleRad);

					let isIn = 0;
					let nearestPoint = Number.MAX_SAFE_INTEGER;
					for (var j=0; j < N; j++) {
						if (i === j) {
							continue;
						}

						var jX = (areas.ellipseParams[j].X+translateX)*scaling;
						var jY = (areas.ellipseParams[j].Y+translateY)*scaling;
						var jA = areas.ellipseParams[j].A*scaling;
						var jB = areas.ellipseParams[j].B*scaling;
						let jR = areas.ellipseParams[j].R

						if (isInEllipse((x + eX), (y + eY), jX, jY, jA, jB, jR)) {
							isIn++;
						}

						for (let jAngle = 0; jAngle < 360; jAngle += 10) {
							let jAngleRad = jAngle.toRadians();
							let {x: jBX, y: jBY} = ellipseBoundaryPosition(jA, jB, jR, jAngleRad);

							let distance = distanceBetweenNodes({x: (jX + jBX), y: (jY + jBY)}, {x: (eX + x), y: (eY + y)})

							nearestPoint = Math.min(distance, nearestPoint);
						}
					}
					minDepth = Math.min(minDepth, isIn);
					maxDepth = Math.max(maxDepth, isIn);

					let tooClose = nearestPoint < 11;
					if (!tooClose) {
						if (currentRange == null || currentRange[0].depth != isIn) {
							// Start a new range.
							currentRange = [];
							ellipseRanges.push(currentRange);
						}
						// Add point to the existing range.
						currentRange.push({
							angle: angle,
							depth: isIn,
							x: (x + eX),
							y: (y + eY),
							distanceToNearest: nearestPoint
						});
					}
					else {
						// End the current range.
						if (currentRange != null) {
							currentRange = null
						}
					}

					if (LABEL_DEBUGGING) {
						let intensity = 255 - (255 / (maxDepth - minDepth) * isIn);
						let dotColour = (tooClose ? "orange" : "rgb(" + intensity + ", " + intensity + ", " + intensity + ")");
						nextSVG ='<circle cx="'+(x + eX) +'" cy="'+(y + eY)+'" r="4" stroke-width="1" stroke="black" fill="' + dotColour + '" />'+"\n";
						svgString += nextSVG;
					}
				}
			}

			for (var i=0; i < N; i++) {
				let ellipseRanges = ranges[i];

				var eX = (areas.ellipseParams[i].X+translateX)*scaling;
				var eY = (areas.ellipseParams[i].Y+translateY)*scaling;
				var eA = areas.ellipseParams[i].A*scaling;
				var eB = areas.ellipseParams[i].B*scaling;
				let eR = areas.ellipseParams[i].R

				let ellipseRangesN = ellipseRanges.length;
				if (ellipseRangesN >= 2) {
					// Check for wrap around. Two ranges around zero.
					if (ellipseRanges[0][0].angle == 0 && ellipseRanges[ellipseRangesN - 1][ellipseRanges[ellipseRangesN - 1].length - 1].angle == 350)
					{
						// Join them together.
						for (let j=0; j < ellipseRanges[0].length; j++) {
							ellipseRanges[0][j].angle += 360;
							ellipseRanges[ellipseRangesN - 1].push(ellipseRanges[0][j])
						}
						ellipseRanges.shift();
					}
				}

				// Sort the ranges by depth (lowest first) and secondarily
				// by length (highest first).
				ellipseRanges.sort(function(a, b) {
					if (a[0].depth != b[0].depth) {
						return a[0].depth - b[0].depth;
					}
					return b.length - a.length;
				});
				for (let j=0; j < ellipseRanges.length; j++) {
					let range = ellipseRanges[j];
				}

				let spacingFromEdge = 8;

				// Take the first range, it will be the best.
				let range = ellipseRanges[0];

				let angle;
				if (ellipseRanges.length == 0) {
					// At top for if no valid regions.
					angle = 270;
				}
				else if (range[0].angle == 0 && range[range.length - 1].angle == 350 && range[26].distanceToNearest >= 50) {
					// At top for full circle, or if no valid range.
					angle = 270;
				}
				else {
					// Take point furthest away from others.
					range.sort(function(a, b) {
						return b.distanceToNearest - a.distanceToNearest;
					});
					angle = range[0].angle;
				}

				if (ellipseDuplication[i] !== undefined) {
					angle -= (15 * (ellipseDuplication[i] - 1));
				}

				eA += spacingFromEdge;
				eB += spacingFromEdge;

				let angleRad = angle.toRadians();
				let {x, y} = ellipseBoundaryPosition(eA, eB, eR, angleRad);

				var textWidth = areas.globalLabelWidths[i];
				var textHeight = areas.globalLabelHeights[i];

				if (LABEL_DEBUGGING) {
					nextSVG ='<circle cx="'+(x + eX) +'" cy="'+(y + eY)+'" r="5" stroke-width="1" stroke="black" fill="red" />'+"\n";
					svgString += nextSVG;
				}

				let halfWidth = (textWidth) / 2;
				let halfHeight = (textHeight) / 2;
				let finalLabelAngle = (angle + eR.toDegrees()) % 360;
				let quarterAngle = finalLabelAngle % 90;

				// Shift the label to allow for the label length.
				if (finalLabelAngle === 0) {
					x += halfWidth;
				}
				else if (finalLabelAngle === 90) {
					y += halfHeight;
				}
				else if (finalLabelAngle === 180) {
					x -= halfWidth;
				}
				else if (finalLabelAngle === 270) {
					y -= halfHeight;
				}
				else if (finalLabelAngle > 0 && finalLabelAngle < 90) {
					x += halfWidth;
					y += halfHeight;
				}
				else if (finalLabelAngle > 90 && finalLabelAngle < 180) {
					x -= halfWidth;
					y += halfHeight;
				}
				else if (finalLabelAngle > 180 && finalLabelAngle < 270) {
					x -= halfWidth;
					y -= halfHeight;
				}
				else if (finalLabelAngle > 270 && finalLabelAngle < 360) {
					x += halfWidth;
					y -= halfHeight;
				}

				var color = findColor(i);
				nextSVG ='<text style="font-family: Helvetica; font-size: ' + labelFontSize + ';" x="'+((x + eX) - textWidth / 2) +'" y="'+(y + eY) +'" fill="'+color+'">'+areas.ellipseLabel[i]+'</text>'+"\n";
				svgString += nextSVG;
			}
		}

		if (intersectionValues) {
			var generateLabelPositions = true;
			var areaInfo = areas.computeAreasAndBoundingBoxesFromEllipses(generateLabelPositions);

			for (var i=0; i < areas.globalZoneStrings.length; i++) {
				var zoneLabel = areas.globalZoneStrings[i];
				var labelPosition = areaInfo.zoneLabelPositions[zoneLabel];
				if (labelPosition !== undefined) {
					//var labelPosition = computeLabelPosition(globalZones[i]);
					var labelX = (labelPosition.x+translateX)*scaling;
					var labelY = (labelPosition.y+translateY)*scaling;
					var textWidth = areas.globalValueWidths[i];
					var textHeight = areas.globalValueHeights[i];
					if (!isNaN(labelX)) {
						nextSVG ='<text dominant-baseline="middle" text-anchor="middle" x="'+labelX+'" y="'+labelY+'" style="font-family: Helvetica; font-size: ' + valueFontSize + ';" fill="black">'+areas.globalOriginalProportions[i]+'</text>'+"\n";
						svgString += nextSVG;
					}

				}
			}
		}

		svgString += '</svg>'+"\n";

		return svgString;
	}


	/**
	 * This returns a transformation to fit the diagram in the given size
	 */
	function findTransformationToFit(width,height, areas) {
		if (typeof areas === "undefined")
		{
			areas = new EdeapAreas();
		}

		canvasWidth = parseInt(width);
		canvasHeight = parseInt(height);

		let sizes = findLabelSizes();
		let idealWidth = canvasWidth - 15 - sizes.maxWidth * 2;
		let idealHeight = canvasHeight - 15 - sizes.maxHeight* 2;

		var desiredCentreX = idealWidth/2;
		var desiredWidth = idealWidth;

		var desiredCentreY = idealHeight/2;
		var desiredHeight = idealHeight;

		var compute = areas.computeAreasAndBoundingBoxesFromEllipses();


		var currentWidth = compute.overallBoundingBox.p2.x-compute.overallBoundingBox.p1.x;
		var currentHeight = compute.overallBoundingBox.p2.y-compute.overallBoundingBox.p1.y;
		var currentCentreX = (compute.overallBoundingBox.p1.x+compute.overallBoundingBox.p2.x)/2;
		var currentCentreY = (compute.overallBoundingBox.p1.y+compute.overallBoundingBox.p2.y)/2;

		var heightMultiplier = desiredHeight/currentHeight;
		var widthMultiplier = desiredWidth/currentWidth;

		var scaling = heightMultiplier;
		if(heightMultiplier > widthMultiplier) {
			scaling = widthMultiplier;
		}
		var desiredCentreX = (canvasWidth/2)/scaling;
		var desiredCentreY = (canvasHeight/2)/scaling;
		var translateX = desiredCentreX-currentCentreX;
		var translateY = desiredCentreY-currentCentreY;

	    return {
			scaling: scaling,
			translateX: translateX,
			translateY: translateY
		};

	}


	function generateRandomZones(maxContours,maxZones,maxZoneSize) {
		var retZones = new Array();

		var count = 0;
		while(retZones.length < maxZones) {

			var zoneCount = Math.floor(Math.random()*maxZoneSize+1)

			var zone = Array();
			for(var i = 0; i < zoneCount;i++) {
				var contourNumber = Math.floor(Math.random()*maxContours+1)
				var contourLabel = "e"+contourNumber;
				zone[i] = contourLabel;
			}
			// check it is not already there
			var notInAlready = true;
			for(var i = 0; i< retZones.length; i++) {
				if(closeness(retZones[i],zone) === 0) {
					notInAlready = false;
				}
			}
			if(notInAlready) {
				retZones.push(zone);
			}

			count++;
			if(count > maxZones*1000) {
				break;
			}
		}
		return retZones;

	}


	function findDuplicateZoneString() {

		var ret = "";
		for(var i=0; i < globalZones.length-1; i++) {
			var zone1 = globalZones[i];
			for(var j=i+1; j < globalZones.length; j++) {
				var zone2 = globalZones[j];
				var diff = contourDifference(zone1,zone2);
				if(diff.length === 0) { // if they are the same
					for(var k=0; k < zone1.length; k++) {
						var contour = zone1[k];
						ret = ret + contour + " ";
					}
					ret += "| ";
				}

			}
		}
		return ret;
	}


	/**
	 returns a number indicating how close the candidate zone is to the
	 existing, laid out, zone. Low numbers are better.
	*/
	function closeness(existing,candidate) {
		var shared = contourShared(existing,candidate).length;
		var diff = contourDifference(existing,candidate).length;
		return diff-shared;
	}


	// Array of contours appearing in both of the zones.
	function contourShared(zone1,zone2) {
		var shared = new Array();
		for(var i=0; i < zone1.length; i++) {
			var contour = zone1[i];
			if(contains(zone2,contour)) {
				shared.push(contour);
			}
		}
		return shared;
	}


	// Array of contours appearing in only one of the zones.
	function contourDifference(zone1,zone2) {
		var diff = new Array();
		for(var i=0; i < zone1.length; i++) {
			var contour = zone1[i];
			if(!contains(zone2,contour)) {
				diff.push(contour);
			}
		}
		for(var i=0; i < zone2.length; i++) {
			var contour = zone2[i];
			if(!contains(zone1,contour)) {
				diff.push(contour);
			}
		}
		return diff;
	}


	function outputLog(page,abstractDescriptionField,width,height,guides,order,line,orientation,strategy,colour) {
		var date = new Date();
		var dateString = date.toUTCString();

		var referrer = document.referrer;
		if(referrer.length > 0) {
			var index = referrer.indexOf("?");
			if(index > 0) {
				referrer = referrer.substring(0,index);
			}
		}

		writelog(dateString+'%0D%0A'+page+'%0D%0Areferrer='+referrer+'%0D%0Awidth='+width+' height='+height+' guides='+guides+' order='+order+' line='+line+' orientation='+orientation+' strategy='+strategy+' colour='+colour+'%0D%0A'+abstractDescriptionField);
	}


	function writelog(message) {

		try {
			var request;
			if (window.XMLHttpRequest) {// code for IE7+, Firefox, Chrome, Opera, Safari
				xmlhttp=new XMLHttpRequest();
			} else {// code for IE6, IE5
				xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
			}

			xmlhttp.onreadystatechange=function() {
				if (xmlhttp.readyState===4 && xmlhttp.status===200) {
					return;
				}
			}

			xmlhttp.open("GET","writelog.php?nocache="+Math.random()+"&message="+message,false);
			xmlhttp.send(null);

		} catch (err) {

			if (window.XMLHttpRequest){
				try{
					request=new ActiveXObject("Microsoft.XMLHTTP");
					request.open("GET", "writelog.php?nocache="+Math.random()+"&message="+message,false);
					request.send();
					if (request.readyState===4 && request.status === 200) {
						return;
					}
				} catch (err) {
					return;
				}
			} else {
				return errmsg;
			}
		}

	}




	function removeProportions(zones) {
		var ret = new Array();
		for(var i=0; i < zones.length; i++) {
			var zone = zones[i];
			var newZone = new Array();
			for(var j=0; j < zone.length-1; j++) { // get all but last element
				var e = zone[j];
				newZone[j] = e;
			}
			ret[i] = newZone;
		}
		return ret;
	}


	function findProportions(zones) {
		var ret = new Array();
		for(var i=0; i < zones.length; i++) {
			var zone = zones[i];
			ret[i] = parseFloat(zone[zone.length-1]);
		}
		return ret;
	}


	function findContoursFromZones(zones) {
		var ret = new Array();
		for(var i=0; i < zones.length; i++) {
			var zone = zones[i];
			for(var j=0; j < zone.length; j++) {
				var e = zone[j];
				if(!contains(ret,e)) {
					ret.push(e);
				}
			}
		}
		ret = sortContours(ret);

		return ret;
	}


	let colourPalettes = {
		"Tableau10": [
			'rgb(78, 121, 167)',
			'rgb(242, 142, 43)',
			'rgb(225, 87, 89)',
			'rgb(118, 183, 178)',
			'rgb(89, 161, 79)',
			'rgb(237, 201, 72)',
			'rgb(176, 122, 161)',
			'rgb(255, 157, 167)',
			'rgb(156, 117, 95)',
			'rgb(186, 176, 172)'
		],
		"Tableau20": [
			'rgb(78, 121, 167)',
			'rgb(160, 203, 232)',
			'rgb(242, 142, 43)',
			'rgb(255, 190, 125)',
			'rgb(89, 161, 79)',
			'rgb(140, 209, 125)',
			'rgb(182, 153, 45)',
			'rgb(241, 206, 99)',
			'rgb(73, 152, 148)',
			'rgb(134, 188, 182)',
			'rgb(225, 87, 89)',
			'rgb(255, 157, 154)',
			'rgb(121, 112, 110)',
			'rgb(186, 176, 172)',
			'rgb(211, 114, 149)',
			'rgb(250, 191, 210)',
			'rgb(176, 122, 161)',
			'rgb(212, 166, 200)',
			'rgb(157, 118, 96)',
			'rgb(215, 181, 166)'
		],
		"Tableau ColorBlind": [
			'rgb(17, 112, 170)',
			'rgb(252, 125, 11)',
			'rgb(163, 172, 185)',
			'rgb(87, 96, 108)',
			'rgb(95, 162, 206)',
			'rgb(200, 82, 0)',
			'rgb(123, 132, 143)',
			'rgb(163, 204, 233)',
			'rgb(255, 188, 121)',
			'rgb(200, 208, 217)'
		],
		"ColorBrewer": [
			'rgb(31,120,180)',
			'rgb(51,160,44)',
			'rgb(255,127,0)',
			'rgb(106,61,154)',
			'rgb(177,89,40)',
			'rgb(227,26,28)',
			'rgb(166,206,227)',
			'rgb(253,191,111)',
			'rgb(178,223,138)',
			'rgb(251,154,153)',
			'rgb(202,178,214)',
			'rgb(255,255,153)'
		]
	};


	function findColor(i) {
		let colourPalette = colourPalettes[colourPaletteName];

		if (i < colourPalette.length) {
			return colourPalette[i];
		}

		return get_random_color();
	}


	function findContours(abstractDescription) {

		// prevent repeated processing
		if(globalContours.length > 0) {
			return globalContours;
		}

		globalContours = new Array();
		var index = 0;
		var adSplit = abstractDescription.split("\n");

		for(var i=0; i < adSplit.length; i++) {
			var line = adSplit[i];
			var lineSplit = line.split(" ");
			for(var j=0; j < lineSplit.length; j++) {
				var contour = lineSplit[j].trim();
				var empty = false;
				try {
					if(contour.length === 0) {
						empty = true;
					}
				} catch (err) {
					empty = true;
				}
				if(!empty) {
					if(!contains(globalContours,contour)) {
						globalContours[index] = contour;
						index++;
					}
				}
			}
		}

		// sort contours
		globalContours = sortContours(globalContours)

		return globalContours;
	}



	function sortContours(contours) {

		contours.sort();

		return contours;

	}

	function get_random_color() {
		var letters = '0123456789ABCDEF'.split('');
		var color = '#';
		for (var i = 0; i < 6; i++ ) {
			color += letters[Math.round(Math.random() * 15)];
		}
		return color;
	}



	function findZones(abstractDescription) {

		// prevent repeated processing
		if(globalZones.length > 0) {
			return globalZones;
		}

		globalZones = new Array();
		var diagramIndex = 0;
		var adSplit = abstractDescription.split("\n");

		for(var i=0; i < adSplit.length; i++) {
			var zone = new Array();
			var zoneIndex = 0;
			var line = adSplit[i];
			var lineSplit = line.split(" ");
			for(var j=0; j < lineSplit.length; j++) {
				var contour = lineSplit[j].trim();
				var empty = false;
				try {
					if(contour.length === 0) {
						empty = true;
					}
				} catch (err) {
					empty = true;
				}
				if(!empty) {
					zone[zoneIndex] = contour;
					zoneIndex++;
				}
			}

			if(zone.length > 0) {
				globalZones[diagramIndex] = zone;
				diagramIndex++;
			}
		}
		return globalZones;
	}


	function decodeAbstractDescription(abstractDescriptionField) {
		var abstractDescription = decodeURIComponent(abstractDescriptionField);
		while(abstractDescription.indexOf("+") != -1) {
			abstractDescription = abstractDescription.replace("+"," ");
		}
		return abstractDescription;
	}

	function encodeAbstractDescription(abstractDescriptionDecoded) {
		var abstractDescription = encodeURIComponent(abstractDescriptionDecoded);
		while(abstractDescription.indexOf(" ") != -1) {
			abstractDescription = abstractDescription.replace(" ","+");
		}
		return abstractDescription;
	}


	function contains(arr,e) {
		for(var i=0; i < arr.length; i++) {
			var current = arr[i];
			if(e === current) {
				return true
			}
		}
		return false;

	}


	function arrayToString(arr) {
		var ret = "";
		for(var i=0; i < arr.length-1; i++) {
			ret += arr[i]+" ";
		}
		ret += arr[arr.length-1];
		return ret;
	}



	function isNumber(n) {
		return !isNaN(parseFloat(n)) && isFinite(n);
	}


	function escapeHTML(string) {
		var pre = document.createElement('pre');
		var text = document.createTextNode(string);
		pre.appendChild(text);
		return pre.innerHTML;
	}



	function gup(name) {
		var regexS = "[\\?&]"+name+"=([^&#]*)";
		var regex = new RegExp( regexS );
		var tmpURL = window.location.href;
		var results = regex.exec(tmpURL);
		if(results === null) {
			return '';
		} else {
			return results[1];
		}
	}




	function randomDiagram(numberOfContours, chanceOfZoneAddition) {

		var zones = findAllZones(numberOfContours);
		var adZones = "";
		for(var i=0; i < zones.length; i++) {
			var z = zones[i];
			if(Math.random() < chanceOfZoneAddition) {
				if(adZones != "") {
					adZones += "\n";
				}
				adZones += z;
			}
		}

		return adZones;
	}

	/**
	 * Returns an array of strings containing all the zone combinations for
	 * the contours, contours labelled with a single letter starting at "a" (venn diagram).
	 * Does not return the outside contour.
	 */
	function findAllZones(numberOfContours) {
		var zoneList = new Array();

		var numberOfZones = Math.pow(2,numberOfContours)-1;
		for(var zoneNumber = 1; zoneNumber <= numberOfZones; zoneNumber++) {
			var zone = findZone(zoneNumber);
			zoneList.push(zone);
		}

//		ZoneStringComparator zComp = new ZoneStringComparator();
//		Collections.sort(zoneList,zComp);

		return zoneList;
	}



	/**
	 * Takes a zone number, which should be seen as a binary,
	 * indicating whether each contour is in the zone.
	 * Contours are assumed to be labelled from "a" onwards.
	 */
	function findZone(zoneNumber) {
		var zoneString = "";
		var current = zoneNumber;
		var i = 0;
		while(current != 0) {
			if(current%2 === 1) {
				var contourChar = String.fromCharCode(97 + i);
				zoneString += contourChar+" ";
			}
			current = Math.floor(current/2);
			i++;
		}
		zoneString = zoneString.trim();
		return zoneString;
	}


	function testPermutations(array,timeout) {

		permutationsTried = 0;
		var groupCount;
		var mapping = new Array();

		groupCount = array.length
		mapping = new Array();
		for(var i = 0; i < groupCount; i++) {
			mapping[i] = i;
		}

		var start = Date.now();
		var currentTime = -1;
		var lineBreaks = -1;

		var bestLineBreaks = 9999999;
		var bestOrder = new Array();

		var loop = true;

		while(loop) {
			permutationsTried++;
			lineBreaks = countLineBreaks(mapping);
			if(lineBreaks < bestLineBreaks) {
				bestLineBreaks = lineBreaks;
				bestOrder = mappingToOrder(mapping, array);
			}
			loop = nextPerm(mapping);
			currentTime = Date.now();
			if(currentTime-start > timeout) {
console.log("timed out after "+(currentTime-start)/1000+" seconds. Permutation count: "+permutationsTried);
				loop = false;
			}

		}
		return bestOrder;
	}


	function mappingToOrder(mapping, array) {
		var ret = new Array();
		for(var i=0; i < mapping.length; i++) {
			ret[i] = array[mapping[i]];
		}
		return ret;
	}


	function nextPerm(p) {

		var i;
		for (i= p.length-1; i-- > 0 && p[i] > p[i+1];)
		;
 		if (i < 0) {
			return false;
		}

		var j;
 		for (j= p.length; --j > i && p[j] < p[i];)
		;
 		swap(p, i, j);

		for (j= p.length; --j > ++i; swap(p, i, j))
		;
 		return true;
	}

	function swap(p, i, j) {
		var t= p[i];
		p[i]= p[j];
		p[j]= t;
	}



		// the lines in the system, defined by pairs of start and stop data, this returns the notional x array of the lines
	function countLineBreaks(zones) {
		var breaks = new Array(); // lines contains arrays that alternates between start and end positions of each line
		var lineStatus = new Array();
		for(var i=0; i < globalContours.length; i++) {
			lineStatus[i] = -1; // -1 for not currently drawing a line, 1 for drawing a line
			breaks[i] = -1; // -1 because first occurence of a line will increment the breaks
		}

		for(var i=0; i < globalContours.length; i++) {
			var line = new Array();
			var contour = globalContours[i];
			for(var j=0; j < zones.length; j++) {
				var zone = zones[j];
				if(contains(zone,contour) && lineStatus[i] === -1) { // zone contains the contour, but was not in previous
					breaks[i] = breaks[i]+1;
					lineStatus[i] = 1;
				}
				if(!contains(zone,contour) && lineStatus[i] === 1) { // zone does not contain the contour, and was in previous
					lineStatus[i] = -1;
				}

			}
		}

		var count = 0;
		for(var i=0; i < breaks.length; i++) {
			count += breaks[i];
		}

		return count;

	}


	function factorial(num) {
		var ret=1;
		for (var i = 2; i <= num; i++)
			ret = ret * i;
		return ret;
	}



	function findLabelSizes() {

		document.getElementById('textLengthMeasure').innerHTML = ""; // clear the div
        let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("style", "font-family: Helvetica; font-size: " + labelFontSize + ";");
		svg.appendChild(text);
		document.getElementById('textLengthMeasure').appendChild(svg);

		const spaceWidth = text.getComputedTextLength();

		var lengths = new Array();
		var heights = new Array();
		let maxHeight = 0;
		let maxWidth = 0;
		for (var i=0; i < ellipseLabel.length; i++) {
			var label = ellipseLabel[i];

			text.textContent = label;

			lengths[i] = text.getComputedTextLength();
			heights[i] = text.getBBox().height;
			maxHeight = Math.max(maxHeight, heights[i]);
			maxWidth = Math.max(maxWidth, lengths[i]);
		}
		document.getElementById('textLengthMeasure').innerHTML = ""; // clear the div
		return {
			lengths,
			heights,
			maxHeight,
			maxWidth
		};
	}



	function findValueSizes() {

		document.getElementById('textLengthMeasure').innerHTML = ""; // clear the div
        let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("style", "font-family: Helvetica; font-size: " + valueFontSize + ";");
		svg.appendChild(text);
		document.getElementById('textLengthMeasure').appendChild(svg);

		var lengths = new Array();
		var heights = new Array();
		for (var i=0; i < globalOriginalProportions.length; i++) {
			var label = globalOriginalProportions[i];

			text.textContent = label;

			lengths[i] = text.getComputedTextLength();
			heights[i] = text.getBBox().height;
		}
		document.getElementById('textLengthMeasure').innerHTML = ""; // clear the div
		return {
			lengths,
			heights
		};
	}
