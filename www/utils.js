var downloadName = "edeap.svg";

var areaSpecification;
var width;
var height;
var canvasWidth;
var canvasHeight;
var translateX = 0;
var translateY = 0;
var scaling = 100;
var showSetLabels = false;
var showIntersectionValues = false;


var idealEllipseArea = 10000;
var ellipseScalingValue; // how much the area specifications are scaled to make the average ellipse idealEllipseArea

var globalContours = []; // size of number of ellipses
var globalZones = []; // size of number of intersections
var globalZoneStrings = []; // size of number of intersections, string version of globalZones
var globalOriginalProportions = []; // proportions before scaling, size of number of intersections
var globalProportions = []; // proportions after scaling, size of number of intersections
var globalOriginalContourAreas = new Array(); // size of number of ellipses
var globalContourAreas = []; // size of number of ellipses
var globalLabelLengths = []; // size of number of ellipses
var globalValueLengths = []; // size of number of intersections
var globalValueHeights = []; // size of number of intersections
var globalAbstractDescription;

var globalZoneAreaTableBody = ""; // to access table output from updateZoneAreaTable, not terribly elegant
var globalTotalDiff = -1; // access to total difference in areas after optimizer has finished
var globalFinalFitness = -1; // access to fitness after optimizer has finished

	function setupGlobal(areaSpecificationText) {

		globalContours = [];
		globalZones = [];
		globalZoneStrings = [];
		globalOriginalProportions = [];
		globalProportions = [];
		globalOriginalContourAreas = [];
		globalContourAreas = [];
		globalLabelLengths = [];
		globalValueLengths = [];
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

		// remove zero zones and proportions
		var removeList = new Array();
		for(var i=0; i < globalProportions.length; i++) {
			var proportion = globalProportions[i];
			if(proportion === 0.0) {
				removeList.push(i);
			}
		}
		for(var i=removeList.length-1; i >= 0; i--) {
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

		for(var i=0; i < areas.ellipseLabel.length; i++) {
			var color = findColor(i);
			var eX = (areas.ellipseParams[i].X+translateX)*scaling;
			var eY = (areas.ellipseParams[i].Y+translateY)*scaling;
			var eA = areas.ellipseParams[i].A*scaling;
			var eB = areas.ellipseParams[i].B*scaling;

			var eR = areas.ellipseParams[i].R.toDegrees();
			nextSVG ='<ellipse cx="'+eX+'" cy="'+eY+'" rx="'+eA+'" ry="'+eB+'" fill="none" stroke="'+color+'" stroke-width="'+2+'" transform="rotate('+eR+' '+eX+' '+eY+' '+')" />'+"\n";
			svgString += nextSVG;
			if(setLabels) {
				var textLength = areas.globalLabelLengths[i];
				var textX = eX-textLength/2;
				var textY = eY-(eB+5);
				nextSVG ='<text x="'+textX+'" y="'+textY+'" fill="'+color+'">'+areas.ellipseLabel[i]+'</text>'+"\n";
				svgString += nextSVG;
			}
		}

		if(intersectionValues) {
			var generateLabelPositions = true;
			// Higher sample size for better label positioning.
			var sampleSize = 300;
			var areaInfo = areas.computeAreasAndBoundingBoxesFromEllipses(generateLabelPositions, sampleSize);

			for(var i=0; i < areas.globalZoneStrings.length; i++) {
				var zoneLabel = areas.globalZoneStrings[i];
				var labelPosition = areaInfo.zoneLabelPositions[zoneLabel];
				if(labelPosition !== undefined) {
					//var labelPosition = computeLabelPosition(globalZones[i]);
					var labelX = (labelPosition.x+translateX)*scaling;
					var labelY = (labelPosition.y+translateY)*scaling;
					var textLength = areas.globalValueLengths[i];
					var textHeight = areas.globalValueHeights[i];
					labelX = labelX-textLength/2;
					labelY = labelY;
					if(!isNaN(labelX)) {
						nextSVG ='<text x="'+labelX+'" y="'+labelY+'" style="dominant-baseline: central;" fill="black">'+areas.globalOriginalProportions[i]+'</text>'+"\n";
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

		canvasHeight = parseInt(height);
		canvasWidth = parseInt(width);

		// 12 is font padding, plus 2 percent of smaller of two dimensions.
		var padding = 12 + Math.min(canvasWidth, canvasHeight) * 0.02;

		var desiredCentreX = canvasWidth/2-padding;
		var desiredCentreY = canvasHeight/2-padding;
		var desiredHeight = canvasHeight-padding*2;
		var desiredWidth = canvasWidth-padding*2;

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




	function findColor(i) {

		// colorbrewer qualitative option for 12 sets, rearranged order
		var colorbrewerArray = ['rgb(31,120,180)','rgb(51,160,44)','rgb(255,127,0)','rgb(106,61,154)',
		'rgb(177,89,40)','rgb(227,26,28)','rgb(166,206,227)','rgb(253,191,111)',
		'rgb(178,223,138)','rgb(251,154,153)','rgb(202,178,214)','rgb(255,255,153)']

		if(i < colorbrewerArray.length) {
			return colorbrewerArray[i];
		}

		var nextColor = i-colorbrewerArray.length;
		predefinedNameArray = ["blue", "magenta", "cyan", "orange", "black", "green", "gray", "yellow", "pink", "purple", "red", "brown", "teal", "aqua"]
		if(nextColor < predefinedNameArray.length) {
			return predefinedNameArray[nextColor];
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

        let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        //Object.assign(text.style, style);
		svg.appendChild(text);
		document.getElementById('textLengthMeasure').appendChild(svg);

		        const spaceWidth = text.getComputedTextLength();

		var lengths = new Array();
		var heights = new Array();
		for(var i=0; i < ellipseLabel.length; i++) {
			var label = ellipseLabel[i];

			text.textContent = label;

			lengths[i] = text.getComputedTextLength();
			heights[i] = text.getBBox().height;
		}
		document.getElementById('textLengthMeasure').innerHTML = ""; // clear the div
		return {
			lengths : lengths,
			heights: heights
		};
	}



	function findValueSizes() {

		var lengths = new Array();
		var heights = new Array();
		for(var i=0; i < globalOriginalProportions.length; i++) {
			var label = globalOriginalProportions[i];

			var textSVG = ' <text id="'+label+'" x=0 y=0 >'+label+'</text>'+"\n";

			var svgText = '<svg width = "200" height = "200">'+textSVG+'</svg>'
			document.getElementById('textLengthMeasure').innerHTML = svgText;
			var bbox1 = document.getElementById(label).getBBox();
			var textWidth = Math.ceil(bbox1.width);
			var textHeight = Math.ceil(bbox1.height);
			lengths[i] = textWidth;
			heights[i] = textHeight;
		}
		document.getElementById('textLengthMeasure').innerHTML = ""; // clear the div
		return {
			lengths : lengths,
			heights: heights
		};
	}
