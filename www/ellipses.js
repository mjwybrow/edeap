"use strict";
//
// Author:  Michael Wybrow <Michael.Wybrow@monash.edu>
//

// An array of ellipse parameters.  Each an opject with the following props:
//   X     X centre
//   Y     Y centre
//   A     X radius
//   B     Y radius
//   R     rotation in radians
var ellipseParams = [];
var ellipseLabel = []; // set associated with ellipse, should be unique
var ellipseArea = [];

// Bit masks for different types of logging.
// Each should have a value of "2 ** n" where n is next value.
const logNothing         = 0;
const logFitnessDetails  = 2 ** 0;
const logOptimizerStep   = 2 ** 1;
const logOptimizerChoice = 2 ** 2;
const logReproducability = 2 ** 3;

let ellipseMap = new Map();

let gridSize = 0.026;

function prevGridValue(value) {
    let number = value / gridSize;
    let multiples = (number < 0) ? Math.ceil(number) : Math.floor(number);
    return (gridSize * multiples);
}

function nextGridValue(value) {
    let number = value / gridSize;
    let multiples = (number < 0) ? Math.floor(number) : Math.ceil(number);
    return (gridSize * multiples);
}

function prevGridPoint(point) {
    return {
        x: prevGridValue(point.x),
        y: prevGridValue(point.y),
    };
}

function nextGridPoint(point) {
    return {
        x: nextGridValue(point.x),
        y: nextGridValue(point.y),
    };
}

// Select the type of logging to display.  To select multiple types
// of logging, assign this variable a value via options separated by
// bitwise OR (|):
//    showLogTypes = logReproducability | logOptimizerStep;
var showLogTypes = logReproducability;

// Function to be able to disable fitness logging.
function logMessage(type, message)
{
    if (showLogTypes & type)
    {
        var args = Array.prototype.slice.call(arguments)
        args.shift();
        console.log.apply(console, args);
    }
}


// Extend Number object with method to convert from degrees to radians.
if (Number.prototype.toRadians === undefined)
{
    Number.prototype.toRadians = function() {
        return this * Math.PI / 180;
    };
}

// Extend Number object with method to convert from radians to (signed) degrees.
if (Number.prototype.toDegrees === undefined)
{
    Number.prototype.toDegrees = function() {
        return this * 180 / Math.PI;
    };
}



// Given an x and y position and an ellipse, this function returns
// a boolean denoting whether the point lies inside the ellipse.
//
// Parameters:
//   x    The x position of the point to test.
//   y    The y position of the point to test.
//   cx   The center x position of the ellipse.
//   cy   The center y position of the ellipse.
//   rx   The x radius of the ellipse.
//   ry   The y radius of the ellipse.
//   rot  The rotation of the ellipse in radians.
//
// Based on mathematics described on this page:
//   https://stackoverflow.com/questions/7946187/point-and-ellipse-rotated-position-test-algorithm
//
function isInEllipse(x, y, cx, cy, rx, ry, rot)
{
    var bigR = Math.max(rx, ry);
    if ((x < (cx - bigR)) || (x > (cx + bigR)) ||
        (y < (cy - bigR)) || (y > (cy + bigR)))
    {
        // Outside bounding box estimation.
        return false;
    }

    var dx = x - cx;
    var dy = y - cy;

    var cos = Math.cos(rot);
    var sin = Math.sin(rot);
    var dd = rx * rx;
    var DD = ry * ry;

    var cosXsinY = cos * dx + sin * dy;
    var sinXcosY = sin * dx - cos * dy;

    var ellipse = (cosXsinY * cosXsinY) / dd +
                  (sinXcosY * sinXcosY) / DD;

    return (ellipse <= 1);
}

// Given an ellipse this function returns the bounding box as
// and object.
//
// Parameters:
//   cx   The center x position of the ellipse.
//   cy   The center y position of the ellipse.
//   rx   The x radius of the ellipse.
//   ry   The y radius of the ellipse.
//   rot  The rotation of the ellipse in radians.
//
// Return value:
//   An object with a p1 and p2 property where each is a point
//   object with an x and y property.
//
// Based on mathematics described on this page:
//   https://math.stackexchange.com/questions/91132/how-to-get-the-limits-of-rotated-ellipse
//
function ellipseBoundingBox(cx, cy, rx, ry, rot)
{
    var acos = rx * Math.cos(rot);
    var bsin = ry * Math.sin(rot);
    var xRes = Math.sqrt(acos * acos + bsin * bsin);

    var asin = rx * Math.sin(rot);
    var bcos = ry * Math.cos(rot);
    var yRes = Math.sqrt(asin * asin + bcos * bcos);

    return {
        p1: {
            x: cx - xRes,
            y: cy - yRes
        },
        p2: {
            x: cx + xRes,
            y: cy + yRes
        },
    };
}

// Compute the distance between two points in the plane.
function distanceBetween(x1, y1, x2, y2)
{
    // Pythagoras: A^2 = B^2 + C^2
    return Math.sqrt(((x2 - x1) ** 2) + ((y2 - y1) ** 2))
}

// ### AREA TEST DEBUG START
//let paramsArray = [];
//let labelsArray = [];
//let lastParams = "";
// ### AREA TEST DEBUG END


class EdeapAreas
{
    constructor(globalArrays)
    {
        if (typeof globalArrays === "undefined")
        {
            globalArrays = ["globalZoneStrings", "globalProportions",
                    "globalValueWidths", "globalValueHeights",
                    "globalLabelWidths", "globalLabelHeights",
                    "globalOriginalProportions",
                    "ellipseLabel", "ellipseParams"];
        }

        // The amount to step when doing area samples for ellipses.
        // We want to calculate this initially and then use the same step size
        // while the optimising the diagram.
        this.areaSampleStep = 0;
        this.maxTotalAreaDiff = 0;

        for (let arrayName of globalArrays)
        {
            this[arrayName] = window[arrayName].slice();
        }

    }

    useEllipseParams(ellipseParams)
    {
        this["ellipseParams"] = ellipseParams.slice();
    }

    // This function uses the ellipses definitions to return various
    // data needed to compute the fitness function.  It returns:
    //   *  The overall bounding box of all ellipses.
    //   *  An array with the bounding box of each ellipse.
    //   *  The sets of labelled zones including the proportional area
    //      for each zone.
    //
    // Parameters:
    //   generateLabelPositions  (Optional, default: false)  Determines
    //                           whether ideal label positions are
    //                           generated.  This is slow.
    //
    // Return value:
    //   An object containing the following properties:
    //     overallBoundingBox   The bounding box of all ellipses.
    //     zoneAreaProportions  An object with a property for each zone
    //                          where the property value is the proportion.
    //     boundingBoxes        An array of bounding boxes where the order
    //                          matches the order of the ellipse information
    //                          arrays.
    //    zoneAveragePositions  Average position of samples in each zone.
    //    zoneLabelPositions    Ideal label position for each zone.  Only
    //                          generated if generateLabelPositions is true.
    //
    computeAreasAndBoundingBoxesFromEllipses(generateLabelPositions)
    {
        if (generateLabelPositions === undefined)
        {
            generateLabelPositions = false;

        }

// ### AREA TEST DEBUG START
//        if (generateLabelPositions) {
//            let paramsString = JSON.stringify(this.ellipseParams);
//            if (paramsString !== lastParams) {
//                paramsArray.push(this.ellipseParams);
//                labelsArray.push(this.ellipseLabel);
//                lastParams = paramsString;
//                console.log(JSON.stringify(paramsArray));
//                console.log(JSON.stringify(labelsArray));
//            }
//        }
// ### AREA TEST DEBUG END
        // !!! Now need this for computing split zones.
        //generateLabelPositions = true;


        var maxAOrB = 0;
        for (var i = 0; i < this.ellipseParams.length; i++)
        {
            maxAOrB = Math.max(this.ellipseParams[i].A, maxAOrB);
            maxAOrB = Math.max(this.ellipseParams[i].B, maxAOrB);
        }
        var ellipseNonOverlapPadding = 0.15 * maxAOrB;

        // Calculate the combined bounding box of all ellipses.
        var totalBB = {
            p1: {
                x: Number.MAX_VALUE,
                y: Number.MAX_VALUE
            },
            p2: {
                x: Number.MIN_VALUE,
                y: Number.MIN_VALUE
            }
        };


        var ellipseBoundingBoxes = [];
        for (var i = 0; i < this.ellipseParams.length; i++)
        {
            // Expand the total bounding box edges to accomodate this
            // ellipse.
            let ellipse = this.ellipseParams[i];
            var bb = ellipseBoundingBox(ellipse.X, ellipse.Y,
                    ellipse.A, ellipse.B, ellipse.R);
            ellipseBoundingBoxes.push(bb);
            totalBB.p1.x = Math.min(totalBB.p1.x, bb.p1.x);
            totalBB.p1.y = Math.min(totalBB.p1.y, bb.p1.y);
            totalBB.p2.x = Math.max(totalBB.p2.x, bb.p2.x);
            totalBB.p2.y = Math.max(totalBB.p2.y, bb.p2.y);
        }

        var oversizedBB = {
            p1: {
                x: totalBB.p1.x - ellipseNonOverlapPadding,
                y: totalBB.p1.y - ellipseNonOverlapPadding
            },
            p2: {
                x: totalBB.p2.x + ellipseNonOverlapPadding,
                y: totalBB.p2.y + ellipseNonOverlapPadding
            }
        };

        var diffX = oversizedBB.p2.x - oversizedBB.p1.x;
        var diffY = oversizedBB.p2.y - oversizedBB.p1.y;

        if (this.areaSampleStep === 0)
        {
            // Work out step size so we sample at least MAX_DIM_SAMPLES
            // in the smaller of the two dimensions.
            //const MAX_DIM_SAMPLES = 50;
            //var diffMin = Math.min(diffX, diffY);
            //this.areaSampleStep = nextGridValue(diffMin / MAX_DIM_SAMPLES);

            // XXX: Use fixed grid size
            this.areaSampleStep = gridSize;
            console.log(logFitnessDetails, "Area sample step: " + this.areaSampleStep);
        }

        let areaSampleStep = this.areaSampleStep;

        // For each point in the overall bounding box, check which ellipses
        // it is inside to determine its zone.
        var zoneInfo = new Map();
        var totalPoints = 0;
        var expandedZonePoints = {};
        var expandedTotalPoints = 0;

        var bitmapSizeX = Math.ceil(diffX / areaSampleStep) + 1;
        var bitmapSizeY = Math.ceil(diffY / areaSampleStep) + 1;
        var length = bitmapSizeX * bitmapSizeY;

        // Always align the area sampling point with a multiple of the
        // areaSampleStep.  Otherwise we could get different values for
        // some ellipses if the left or top of the bounding box changes.
        var startX = prevGridValue(oversizedBB.p1.x);
        var startY = prevGridValue(oversizedBB.p1.y);
        var endX =   nextGridValue(oversizedBB.p2.x);
        var endY =   nextGridValue(oversizedBB.p2.y);

// ### AREA TEST DEBUG START
//        var movedX1 = oversizedBB.p1.x - startX;
//        var movedY1 = oversizedBB.p1.y - startY;
//        var movedX2 = endX - oversizedBB.p2.x;
//        var movedY2 = endY - oversizedBB.p2.y;
// ### AREA TEST DEBUG END

        let ellipseKeys = [];
        let expandedEllipseKeys = [];

        for (var i = 0; i < this.ellipseParams.length; i++)
        {
            let ellipse = this.ellipseParams[i];
            let label = this.ellipseLabel[i];

            let ellipseMapKey = ellipse.X + ":" + ellipse.Y + ":" +
                    ellipse.A + ":" + ellipse.B + ":" + ellipse.R;
            let ellipseHitInfo = ellipseMap.get(ellipseMapKey);

            //ellipseHitInfo = undefined;
            if (ellipseHitInfo === undefined) {
                // Expand the total bounding box edges to accomodate this
                // ellipse.
                let bb = ellipseBoundingBox(ellipse.X, ellipse.Y,
                        ellipse.A, ellipse.B, ellipse.R);

                let oversizedBB = {
                    p1: {
                        x: bb.p1.x - ellipseNonOverlapPadding,
                        y: bb.p1.y - ellipseNonOverlapPadding
                    },
                    p2: {
                        x: bb.p2.x + ellipseNonOverlapPadding,
                        y: bb.p2.y + ellipseNonOverlapPadding
                    }
                };

                let diffX = oversizedBB.p2.x - oversizedBB.p1.x;
                let diffY = oversizedBB.p2.y - oversizedBB.p1.y;

                let hitmapSizeX = Math.ceil(diffX / gridSize) + 1;
                let hitmapSizeY = Math.ceil(diffY / gridSize) + 1;
                let hitmapLength = hitmapSizeX * hitmapSizeY;

                let hitInfo = {
                    smallHitArray: new Array(hitmapLength),
                    smallHitArraySizeX: hitmapSizeX,
                    position: prevGridPoint(oversizedBB.p1),
                    endPosition: nextGridPoint(oversizedBB.p2)
                };
                ellipseKeys[i] = hitInfo;
                ellipseMap.set(ellipseMapKey, hitInfo);


                let hitArray = hitInfo.smallHitArray;

                let yCounter = 0;
                for (let y = hitInfo.position.y; y <= hitInfo.endPosition.y; y = y + gridSize)
                {
                    let xCounter = 0;
                    for (let x = hitInfo.position.x; x <= hitInfo.endPosition.x; x = x + gridSize)
                    {

                        let index = yCounter * hitmapSizeX + xCounter;

                        let inside = isInEllipse(x, y, ellipse.X, ellipse.Y,
                                ellipse.A, ellipse.B, ellipse.R);
                        let insideValue = 0;
                        if (inside) {
                            insideValue = 1;
                        }
                        else
                        {
                            // Not inside ellipse, see if inside expanded ellipse
                            inside = isInEllipse(x, y, ellipse.X, ellipse.Y,
                                ellipse.A + ellipseNonOverlapPadding,
                                ellipse.B + ellipseNonOverlapPadding,
                                ellipse.R);
                            if (inside) {
                                insideValue = 2;
                            }
                        }

                        hitArray[index] = insideValue;
                        xCounter++;
                    }
                    yCounter++;
                }
            }
            else {
                ellipseKeys[i] = ellipseHitInfo;
            }
        }


        let lastZoneInfoVal = null;
        let lastZone = null;

// ### AREA TEST DEBUG START
//        let xRange = endX - startX;
//        let yRange = endY - startY;
// ### AREA TEST DEBUG END

        let yCounter = 0;
        var xCounter = 0;
        for (let y = startY; y <= endY; y = y + areaSampleStep)
        {
            xCounter = 0;
            for (let x = startX; x <= endX; x = x + areaSampleStep)
            {
                // zone is a list of sets.
                let sets = [];
                let expandedSets = [];
                for (let i = 0; i < this.ellipseParams.length; i++)
                {
                    let ellipseAreaInfo = ellipseKeys[i];

                    let inside = 0;
                    if (x >= ellipseAreaInfo.position.x &&
                        x <= ellipseAreaInfo.endPosition.x &&
                        y >= ellipseAreaInfo.position.y &&
                        y <= ellipseAreaInfo.endPosition.y) {

                        let effectiveX = x - ellipseAreaInfo.position.x;
                        let effectiveY = y - ellipseAreaInfo.position.y;
                        let xCounter = Math.floor(effectiveX / gridSize);
                        let yCounter = Math.floor(effectiveY / gridSize);

                        let index = yCounter * ellipseAreaInfo.smallHitArraySizeX + xCounter;
                        inside =  ellipseAreaInfo.smallHitArray[index];

                        if (inside === 1)
                        {
                            // For each set the point is inside, add the label
                            // for the set to the sets list.
                            let label = this.ellipseLabel[i];
                            sets.push(label);
                            expandedSets.push(label);
                        }
                        else if (inside === 2)
                        {
                            let label = this.ellipseLabel[i];
                            expandedSets.push(label);
                        }

                    }

                }

                // zone string is just the sets list stringified.
                if (sets.length > 0)
                {
                    let zone = sets.toString();
                    let zoneInfoVal = null;
                    if (zone === lastZone) {
                        zoneInfoVal = lastZoneInfoVal;
                    }
                    else {
                        zoneInfoVal = zoneInfo.get(zone);
                        if (zoneInfoVal === undefined)
                        {
                            // Zone has not been seen, add it with 1 point.
                            zoneInfoVal = {
                                points: 0,
                                avgPos: {
                                    x: 0,
                                    y: 0,
                                    count: 0,
                                    firstX: x,
                                    firstY: y,
                                    firstXIndex: xCounter,
                                    firstYIndex: yCounter
                                }
                            };
                            zoneInfo.set(zone, zoneInfoVal);

                            if (generateLabelPositions)
                            {
                                // Create the empty bitmap for zone.
                                zoneInfoVal.bitmap = new Array(length).fill(false);
                            }
                        }
                        lastZone = zone;
                        lastZoneInfoVal = zoneInfoVal;
                    }

                    // Zone has been seen, increment points count.
                    zoneInfoVal.points++;

                    if (generateLabelPositions)
                    {
                        // Mark point in zone bitmap.
                        zoneInfoVal.bitmap[yCounter * bitmapSizeX + xCounter] = true;
                    }

                    // Add this position to the x and y total,
                    // so we can compute average position later.
                    zoneInfoVal.avgPos.x += x;
                    zoneInfoVal.avgPos.y += y;
                    zoneInfoVal.avgPos.count += 1;

                    // Update totalPoints if point is not in empty set.
                    totalPoints++;
                }

                if (expandedSets.length > 0)
                {
                    // zone string is just the sets list stringified.
                    let expandedZone = expandedSets.toString();
                    if (expandedZonePoints.hasOwnProperty(expandedZone))
                    {
                        // Zone has been seen, increment points count.
                        expandedZonePoints[expandedZone] += 1;
                    }
                    else
                    {
                        // Zone has not been seen, add it with 1 point.
                        expandedZonePoints[expandedZone] = 1;
                    }

                    // Update expandedTotalPoints if point is not in empty set.
                    expandedTotalPoints++;
                }

                xCounter++;
            }
            yCounter++;
        }

        for (var i = 0; i < this.ellipseParams.length; i++)
        {
            let ellipseAreaInfo = ellipseKeys[i];
            ellipseAreaInfo.needsFilling = false;
        }

        // For each zone, calculate the proportion of its area of the
        // total area of all zones other than the non-labelled zone.
        var zoneProportions = {};
// ### AREA TEST DEBUG START
//        var zoneSamples = {};
// ### AREA TEST DEBUG END
        for (let [key, value] of zoneInfo.entries())
        {
            var proportion = value.points / totalPoints;
            zoneProportions[key] = proportion;
// ### AREA TEST DEBUG START
//            zoneSamples[key] = value.points;
// ### AREA TEST DEBUG END
        }

        // For each expanded zone, calculate the proportion of its area of the
        // total area of all zones other than the non-labelled zone.
        var expandedZoneProportions = {};
        for (var property in expandedZonePoints)
        {
            var proportion = expandedZonePoints[property] / expandedTotalPoints;
            expandedZoneProportions[property] = proportion;
        }


        var splitZoneAreaProportions = {};

        var result = {
            overallBoundingBox: totalBB,
            boundingBoxes: ellipseBoundingBoxes,
            zoneAreaProportions: zoneProportions,
// ### AREA TEST DEBUG START
//            zoneSamples: zoneSamples,
//            xCount: xCounter,
//            yCount: yCounter,
//            xRange: xRange,
//            yRange: yRange,
//            movedX1,
//            movedY1,
//            movedX2,
//            movedY2,
//            totalSamples: totalPoints,
// ### AREA TEST DEBUG START
            splitZoneAreaProportions: splitZoneAreaProportions,
            expandedZoneAreaProportions: expandedZoneProportions
        };

        // Return the point in each zone with the widest x and y coord.
        var zoneLabelPositions = {};
        for (let [zone, zoneValue] of zoneInfo.entries())
        {
            let bitmap = zoneValue.bitmap;
            if (bitmap === undefined) {
                continue;
            }
            // Scan the bitmap of points within this zone in order to determine
            // the number of disconnected fragments.  We do this by flood-filling
            // with the fillFragment function on the zoneFragmentMap array. After
            // this process zoneFragmentSizes will hold the size in sampled points
            // of each of the regions.
            let zoneFragmentSizes = [];
            let zoneFragmentMap = new Array(length).fill(0);
            for (let y = 0; y < bitmapSizeY; y++)
            {
                for (let x = 0; x < bitmapSizeX; x++)
                {
                    let index = (y * bitmapSizeX) + x;
                    let inZone = bitmap[index];
                    if (inZone)
                    {
                        if (zoneFragmentMap[index] === 0)
                        {
                            // This is a unnumbered fragment (i.e., a fragment of
                            // the zone we haven't encountered yet), number all
                            // adjoining points as part of this fragment and
                            // then record the size of the fragment.
                            let size = this._fillFragment(zoneFragmentMap, bitmap, x, y, bitmapSizeX, bitmapSizeY, zoneFragmentSizes.length + 1);
                            zoneFragmentSizes.push(size);
                        }
                    }
                }
            }

            if (zoneFragmentSizes.length > 1)
            {
                // For zones with more than one fragment, i.e., split zones,
                // return the sum of the proportion of the size of all fragments
                // after the first.

                // First, order smallest to largest.  We want the optimiser to
                // shrink smaller fragments.
                zoneFragmentSizes.sort(function orderLargestFirst(a, b) {
                    return b - a;
                });

                let points = 0;
                for (let index = 1; index < zoneFragmentSizes.length; index++)
                {
                    // For each fragment beyond the first.
                    if (zoneFragmentSizes[index] < 10)
                    {
                        // Ignore small fragments of less than 10 points.  these
                        // can occur when ellipses have overlapping sizes.
                        continue;
                    }

                    // Count the number of points in the fragment of the zone.
                    points += zoneFragmentSizes[index];
                }
                let proportion = points / totalPoints;
                logMessage(logFitnessDetails, "Split zone: " + zone + ": " + zoneFragmentSizes + "  penalty area: " + proportion);
                splitZoneAreaProportions[zone] = proportion;
            }
            else
            {
                splitZoneAreaProportions[zone] = 0;
            }

            let zoneAvgPos = zoneInfo.get(zone).avgPos;
            // Update average points.
            zoneAvgPos.x /= zoneAvgPos.count;
            zoneAvgPos.y /= zoneAvgPos.count;
            delete zoneAvgPos.count;

            var x = zoneAvgPos.firstXIndex;
            var y = zoneAvgPos.firstYIndex;
            delete zoneAvgPos.firstXIndex;
            delete zoneAvgPos.firstYIndex;

            if (generateLabelPositions)
            {
                function isInRegion(x, y) {
                    let index = (y * bitmapSizeX) + x;
                    if (index >= 0 && index < length)
                    {
                        return (bitmap[index]) ? 1 : 0;
                    }
                    return 0;
                }

                function pointFreedomCount(x, y) {
                    let neighbourCount = 0;
                    neighbourCount += isInRegion(x, y);
                    if (neighbourCount === 0) {
                        return 0;
                    }
                    neighbourCount += isInRegion(x - 1, y);
                    neighbourCount += isInRegion(x + 1, y);
                    neighbourCount += isInRegion(x, y - 1);
                    neighbourCount += isInRegion(x, y + 1);
                    return neighbourCount;
                }

                var centreX = Math.floor((zoneAvgPos.x - oversizedBB.p1.x) / areaSampleStep);
                var centreY = Math.floor((zoneAvgPos.y - oversizedBB.p1.y) / areaSampleStep);

                if ((centreX > 0) && (centreY > 0) && bitmap[(centreY * bitmapSizeX) + centreX] === true)
                {
                    x = centreX;
                    y = centreY;
                }

                // If the candidate point doesn't have freedom on all sides,
                // try and pick one that does.
                if (pointFreedomCount(x, y) < 5) {
                    let freePoint = null;
                    for (let ty = 0; ty < bitmapSizeY && !freePoint; ty++) {
                        for (let tx = 0; tx < bitmapSizeX && !freePoint; tx++) {
                            if (pointFreedomCount(tx, ty) === 5) {
                                freePoint = {x: tx, y: ty};
                            }
                        }
                    }
                    if (freePoint) {
                        x = freePoint.x;
                        y = freePoint.y;
                    }
                }

                var movement = true;
                var limit = 20;
                while (movement && (limit > 0))
                {
                    movement = false;
                    --limit;

                    // Move to the center in the x dimension.

                    var xMin = x;
                    var xMax = x;

                    while (bitmap[(y * bitmapSizeX) + xMin] && xMin > 0)
                    {
                        xMin--;
                    }

                    while (bitmap[(y * bitmapSizeX) + xMax] && xMax < bitmapSizeX)
                    {
                        xMax++;
                    }

                    var xMid = xMin + Math.floor((xMax - xMin) / 2);
                    if (x !== xMid)
                    {
                        movement = true;
                        x = xMid;
                    }

                    // Move to the center in the y dimension.

                    var yMin = y;
                    var yMax = y;

                    while (bitmap[(yMin * bitmapSizeX) + x] && yMin > 0)
                    {
                        yMin--;
                    }

                    while (bitmap[(yMax * bitmapSizeX) + x] && yMax < bitmapSizeY)
                    {
                        yMax++;
                    }

                    var yMid = yMin + Math.floor((yMax - yMin) / 2);
                    if (y !== yMid)
                    {
                        movement = true;
                        y = yMid;
                    }
                }

                // Calculate and return the actual point.
                var xPos = startX + x * areaSampleStep;
                var yPos = startY + y * areaSampleStep;
                zoneLabelPositions[zone] = {
                    x: xPos,
                    y: yPos
                };
            }
        }

        if (generateLabelPositions)
        {
            result.zoneLabelPositions = zoneLabelPositions;
        }


        let zoneAvgPosArray = [];
        for (let [label, value] of zoneInfo.entries()) {
            zoneAvgPosArray[label] = value.avgPos;
        }
        result.zoneAveragePositions = zoneAvgPosArray;

        return result;
    }

    // Recursive flood-fill to find connected fragments of zones.
    // zoneFragmentMap is an array of the sampled points with their fragment, or 0.
    // bitmap is an array with sampled points. true if in zone, false if outside.
    // x and y are the point in the map to consider.
    // bitmapSize{X,Y} are the size of zoneFragmentMap and bitmap.
    // zoneFragmentN is the number we are assigning to the fragment we are filling.
    //
    _fillFragment(zoneFragmentMap, bitmap, x, y, bitmapSizeX, bitmapSizeY, zoneFragmentN)
    {
        let toTest = [];
        let total = 0;

        function tryFill(x, y)
        {
            if ((y >= 0) && (y < bitmapSizeY) &&
                (x >= 0) && (x < bitmapSizeX))
            {
                let index = (y * bitmapSizeX) + x;
                if (bitmap[index])
                {
                    // Is in zone.
                    if (zoneFragmentMap[index] === 0)
                    {
                        toTest.push([x, y]);
                        // And not assignment to a fragment.
                        zoneFragmentMap[index] = zoneFragmentN;
                        total++;
                    }
                }
            }
        }

        tryFill(x, y);

        while (toTest.length > 0)
        {
            let point = toTest.pop();
            let x = point[0];
            let y = point[1];

            // Try the surrounding cells.
            tryFill(x, y - 1);
            tryFill(x, y + 1);
            tryFill(x - 1, y);
            tryFill(x + 1, y);
        }

        return total;
    }


    // This is experimental
    //
    _missingZonePenalty(missingZone, fitnessData, fitness)
    {
        var actualZones = fitnessData.zoneAreaProportions;
        var zonePositions = fitnessData.zoneAveragePositions;

        var labelsInZoneB = missingZone.split(",");
        if (labelsInZoneB.length === 1)
        {
            // Missing zone with one label.
            // Push this ellipse away from other ellipses.
            var ellipseIndex = this.ellipseLabel.indexOf(labelsInZoneB[0]);
            let ellipseC = this.ellipseParams[ellipseIndex];
            var cx = ellipseC.X;
            var cy = ellipseC.Y;
            var ca = ellipseC.A;
            var cb = ellipseC.B;

            for (var e = 0; e < this.ellipseLabel.length; e++)
            {
                if (e !== ellipseIndex)
                {
                    let ellipseE = this.ellipseParams[e];
                    var ex = ellipseE.X;
                    var ey = ellipseE.Y;
                    var ea = ellipseE.A;
                    var eb = ellipseE.B;
                    var separation = Math.max(ea, eb) + Math.max(ca, cb);

                    var dist = separation - distanceBetween(cx, cy, ex, ey);
                    dist = Math.max(0, dist);
                    fitness.missingOneLabelZone += dist;
                }
            }
        }
        else if (labelsInZoneB.length >= 2)
        {
            // For a missing zone B...

            logMessage(logFitnessDetails, "  + Missing zone: " + missingZone);
            var zoneWithMostSharedLabels = null;
            var numberOfMostSharedLabels = 0;
            var labelsOfZoneWithMostSharedLabels = null;
            // Find the actual zone C that shares the most labels with B
            for (var existingZone in fitnessData.zoneAreaProportions)
            {
                // Count common labels between C and B
                var count = 0;
                var existingZoneLabels =  existingZone.split(",");
                for (var i = 0; i < labelsInZoneB.length; i++)
                {
                    if (existingZoneLabels.includes(labelsInZoneB[i]))
                    {
                        ++count;
                    }
                }

                if (count > numberOfMostSharedLabels)
                {
                    // If C had more than current largest, make it the largest.
                    numberOfMostSharedLabels = count;
                    zoneWithMostSharedLabels = existingZone;
                    labelsOfZoneWithMostSharedLabels = existingZoneLabels;
                }
                else if (count > 0 && count === numberOfMostSharedLabels)
                {
                    // If there is a tie, take the zone with fewer labels.
                    if (existingZoneLabels.length >
                            labelsOfZoneWithMostSharedLabels.length)
                    {
                        numberOfMostSharedLabels = count;
                        zoneWithMostSharedLabels = existingZone;
                    }
                }
            }

            // If we found a zone C that shares labels with B...
            if (zoneWithMostSharedLabels)
            {
                logMessage(logFitnessDetails, "     + Zone with most shared labels: " + zoneWithMostSharedLabels);

                // Find the set of labels in B that are not in C.
                var labelsInZoneBButNotZoneC = labelsInZoneB.slice();
                var labelsInZoneC = zoneWithMostSharedLabels.split(",");
                for (var j = 0; j < labelsInZoneC.length; ++j)
                {
                    var index = labelsInZoneBButNotZoneC.indexOf(labelsInZoneC[j]);
                    if (index !== -1)
                    {
                        labelsInZoneBButNotZoneC.splice(index, 1);
                    }
                }

                // A point known to be in zone C.
                var zx = zonePositions[zoneWithMostSharedLabels].firstX;
                var zy = zonePositions[zoneWithMostSharedLabels].firstY;
                logMessage(logFitnessDetails, "     + x: " + zx + ", " + "y: " + zy);

                // For each label in B that is not in C
                for (var j = 0; j < labelsInZoneBButNotZoneC.length; ++j)
                {
                    var labelInZoneB = labelsInZoneBButNotZoneC[j];
                    logMessage(logFitnessDetails, "     + Other label: " + labelInZoneB + " (pull closer)");

                    // Pull the ellipse for that label from B closer to...
                    var jEllipseIndex = this.ellipseLabel.indexOf(labelInZoneB);
                    var jx = this.ellipseParams[jEllipseIndex].X;
                    var jy = this.ellipseParams[jEllipseIndex].Y;

                    // ... the point known to be in zone C.
                    fitness.missingTwoOrMoreLabelZone += distanceBetween(jx, jy, zx, zy);
                }

                if (numberOfMostSharedLabels === labelsInZoneB.length)
                {
                    // Find the set of labels in C that are not in B.
                    var labelsInZoneCButNotZoneB = labelsInZoneC.slice();
                    for (var j = 0; j < labelsInZoneB.length; ++j)
                    {
                        var index = labelsInZoneCButNotZoneB.indexOf(labelsInZoneB[j]);
                        if (index !== -1)
                        {
                            labelsInZoneCButNotZoneB.splice(index, 1);
                        }
                    }

                    // A point known to be in zone C.
                    var zx = zonePositions[zoneWithMostSharedLabels].firstX;
                    var zy = zonePositions[zoneWithMostSharedLabels].firstY;
                    logMessage(logFitnessDetails, "     + x: " + zx + ", " + "y: " + zy);

                    // For each label in C that is not in B (i.e., not desired)...
                    for (var j = 0; j < labelsInZoneCButNotZoneB.length; ++j)
                    {
                        var labelInZoneC = labelsInZoneCButNotZoneB[j];
                        logMessage(logFitnessDetails, "     + Other label: " + labelInZoneC + " (push away)");

                        // Push away each of ellipses in Zone B.
                        for (var k = 0; k < labelsInZoneB.length; ++k)
                        {
                            logMessage(logFitnessDetails, "         + Separate: " + labelInZoneC + ", " + labelsInZoneB[k]);

                            // Push the ellipse for that label away from...
                            var jEllipseIndex = this.ellipseLabel.indexOf(labelInZoneC);
                            let ellipseJ = this.ellipseParams[jEllipseIndex];
                            var jx = ellipseJ.X;
                            var jy = ellipseJ.Y;
                            var ja = ellipseJ.A;
                            var jb = ellipseJ.B;
                            var jr = Math.max(ja, jb);

                            var ellipseIndex = this.ellipseLabel.indexOf(labelsInZoneB[k]);
                            let ellipseK = this.ellipseParams[ellipseIndex];
                            var kx = ellipseK.X;
                            var ky = ellipseK.Y;
                            var ka = ellipseK.A;
                            var kb = ellipseK.B;
                            var kr = Math.max(ka, kb);

                            // Subtract the distance between two points from the minimum separation.
                            var diff = kr + jr - distanceBetween(kx, ky, jx, jy);

                            // ... the point known to be in zone C.
                            fitness.missingTwoOrMoreLabelZone += diff;
                        }
                    }
                }
            }
        }
    }


    // This is experimental
    //
    _unwantedZonePenalty(zone, difference, actualZones, fitness)
    {
        logMessage(logFitnessDetails, "   + Unwanted zone: " + zone);
        var zonesArray = zone.split(",");

        // For an undesired actual zone A...

        // Check that there is no desired zone B...
        for (var i = 0; i < this.globalZoneStrings.length; ++i)
        {
            // That has all the labels from zone A
            var count = 0;
            var desiredZoneLabels = this.globalZoneStrings[i].split(",");
            for (var k = 0; k < zonesArray.length; ++k)
            {
                if (desiredZoneLabels.includes(zonesArray[k]))
                {
                    ++count;
                }
            }

            // If there is...
            if (count === zonesArray.length)
            {
                // If it is just a single label unwanted zone,
                if (zonesArray.length === 1)
                {
                    // Penalise this.
                    fitness.unwantedZone += difference;

                    return true;
                }
                else
                {
                    // Otherwise there is a desired zone that has all the labels
                    // of zone, so none of the ellipses involved in this zone
                    // need to be moved apart.
                    return false;
                }
            }
        }


        // If there isn't a desired zone that has all the labels of zone A...

        // Start with a factor of 1.
        var factor = 1;

        // The consider every pair of labels in zone A...
        for (let i = 0; i < zonesArray.length; i++)
        {
            var iZone = zonesArray[i];
            for (let j = i + 1; j < zonesArray.length; j++)
            {
                let jZone = zonesArray[j];

                // For the pair of labels, check there is no desired zone
                // with both those labels...
                let isDesiredZoneContainingBothLabels = false;
                for (let k = 0; k < this.globalZoneStrings.length; ++k)
                {
                    let desiredZoneLabels = this.globalZoneStrings[k].split(",");
                    if (desiredZoneLabels.includes(iZone) && desiredZoneLabels.includes(jZone))
                    {
                        isDesiredZoneContainingBothLabels = true;
                        break;
                    }
                }

                if (isDesiredZoneContainingBothLabels === false)
                {
                    // For each ellipse beyond the first we increase the factor by 0.1.
                    factor += 0.1;

                    // If there isn't, try and push the ellipses for
                    // these two labels away from each other.

                    logMessage(logFitnessDetails, "     + Separate: " + zonesArray[i] + ", " + zonesArray[j]);

                    // Missing zone with one label.
                    // Push this ellipse away from other ellipses.
                    var ellipseIndex = this.ellipseLabel.indexOf(zonesArray[i]);
                    let ellipseI = this.ellipseParams[ellipseIndex];
                    var ix = ellipseI.X;
                    var iy = ellipseI.Y;
                    var ia = ellipseI.A;
                    var ib = ellipseI.B;
                    var ir = Math.max(ia, ib);

                    var ellipseIndex = this.ellipseLabel.indexOf(zonesArray[j]);
                    let ellipseJ = this.ellipseParams[ellipseIndex];
                    var jx = ellipseJ.X;
                    var jy = ellipseJ.Y;
                    var ja = ellipseJ.A;
                    var jb = ellipseJ.B;
                    var jr = Math.max(ja, jb);

                    // Subtract the distance between the two ellipse centres from
                    // the minimum separation.
                    var diff = ir + jr - distanceBetween(ix, iy, jx, jy);
                    fitness.unwantedZone += diff * factor;
                }
            }
        }

        return true;
    }


    // Compute the fitness components of the ellipses layout.
    computeFitnessComponents()
    {
        var penalty = 0;
        var fitnessData = this.computeAreasAndBoundingBoxesFromEllipses();

        // Build up a set of all desired and actual zones.
        var allZones = new Set();
        for (var zone in fitnessData.zoneAreaProportions)
        {
            allZones.add(zone);
        }
        for (var i = 0; i < this.globalZoneStrings.length; ++i)
        {
            var zone = this.globalZoneStrings[i];
            allZones.add(zone);
        }

        logMessage(logFitnessDetails, "Fitness calculation:")
        var fitness = {
            zoneAreaDifference: 0,
            unwantedZone: 0,
            circleDistortion: 0,
            splitZone: 0,
            missingOneLabelZone: 0,
            missingTwoOrMoreLabelZone: 0,
            unwantedExpandedOverlap: 0
        };

        // Save us recomputing these in nested loops.
        let splitGlobalZoneStrings = [];
        for (var k = 0; k < this.globalZoneStrings.length; ++k)
        {
            splitGlobalZoneStrings[k] = this.globalZoneStrings[k].split(",");
        }

        var nonOverlappingPairs = [];
        // Compute ellipses we don't want to be overlapping or touching.
        for (var i = 0; i < this.ellipseLabel.length; i++)
        {
            var labelI = ellipseLabel[i];
            for (var j = i + 1; j < this.ellipseLabel.length; j++)
            {
                var labelJ = this.ellipseLabel[j];

                var shouldOverlap = false;
                for (var k = 0; k < this.globalZoneStrings.length; ++k)
                {
                    var desiredZoneLabels = splitGlobalZoneStrings[k];
                    if  (desiredZoneLabels.includes(labelI) &&
                         desiredZoneLabels.includes(labelJ))
                    {
                        shouldOverlap = true;
                        break;
                    }
                }

                if (shouldOverlap === false)
                {
                    var pair = labelI + "," + labelJ;
                    nonOverlappingPairs.push(pair);
                }
            }
        }

        for (var i = 0; i < nonOverlappingPairs.length; i++)
        {
            var labels = nonOverlappingPairs[i].split(",");
            var labelA = labels[0];
            var labelB = labels[1];

            var overlapPercentage = 0;
            for (var zone in fitnessData.expandedZoneAreaProportions)
            {
                var zoneLabels = zone.split(",");
                if (zoneLabels.includes(labelA) && zoneLabels.includes(labelB))
                {
                    overlapPercentage += fitnessData.expandedZoneAreaProportions[zone];
                }
            }

            if (overlapPercentage > 0)
            {
                logMessage(logFitnessDetails, " + Unwanted expanded overlap: "     + labelA + ", " + labelB);
                fitness.unwantedExpandedOverlap += overlapPercentage;
            }
        }

        var fullyContainedPairs = [];
        // Compute ellipses that are fully contained in other ellipses (which
        // we don't want to have unnecessarily overlapping borders).
        for (var i = 0; i < this.ellipseLabel.length; i++)
        {
            var labelI = this.ellipseLabel[i];
            for (var j = 0; j < this.ellipseLabel.length; j++)
            {
                if (i === j)
                {
                    // Don't consider same label.
                    continue;
                }

                var labelJ = this.ellipseLabel[j];

                var iIsOnlyContainedInJ = true;
                var jExistsOutsideOfI = false;
                for (var k = 0; k < this.globalZoneStrings.length; ++k)
                {
                    var desiredZoneLabels = splitGlobalZoneStrings[k];

                    if  (desiredZoneLabels.includes(labelI) &&
                         !desiredZoneLabels.includes(labelJ))
                    {
                        iIsOnlyContainedInJ = false;
                    }

                    if  (!desiredZoneLabels.includes(labelI) &&
                         desiredZoneLabels.includes(labelJ))
                    {
                        jExistsOutsideOfI = true;
                    }
                }

                if (iIsOnlyContainedInJ && jExistsOutsideOfI)
                {
                    // Ellipse with label I is fully contained in ellipse with
                    // label J.
                    // console.log(labelI + " is fully contained within " + labelJ);
                    var pair = labelI + "," + labelJ;
                    fullyContainedPairs.push(pair);
                }
            }
        }


        // For each desired or actual zone add to the fitness value the
        // difference between the actual and desired area.
        for (var zone of allZones)
        {
            var zoneIsUnwanted = false;
            var zoneIsMissing = false;

            logMessage(logFitnessDetails, " + Zone: " + zone);
            var actualAreaProportion = 0;
            if (fitnessData.zoneAreaProportions.hasOwnProperty(zone))
            {
                actualAreaProportion = fitnessData.zoneAreaProportions[zone];
            }
            else
            {
                zoneIsMissing = true;
                this._missingZonePenalty(zone, fitnessData, fitness);
            }

            var desiredAreaProportion = 0;
            var zoneIndex = this.globalZoneStrings.indexOf(zone);
            if (zoneIndex !== -1)
            {
                desiredAreaProportion = this.globalProportions[zoneIndex];
            }
            else
            {
                zoneIsUnwanted = true;
            }

            logMessage(logFitnessDetails, "   + Actual: " + actualAreaProportion.toFixed(4) + ", Desired: " + desiredAreaProportion.toFixed(4));

            var difference = Math.abs(actualAreaProportion - desiredAreaProportion);
            if (zoneIsUnwanted)
            {
                this._unwantedZonePenalty(zone, difference, fitnessData.zoneAreaProportions, fitness);
            }

            fitness.zoneAreaDifference += difference;

            // Fitness component for split zones.
            if (fitnessData.splitZoneAreaProportions.hasOwnProperty(zone))
            {
                fitness.splitZone += fitnessData.splitZoneAreaProportions[zone];
            }

        }

        // Add to the fitness the difference between radiuses --
        // we prefer circles over ellipses.
        for (var i = 0; i < this.ellipseLabel.length; ++i)
        {
            fitness.circleDistortion += (1 - (Math.min(this.ellipseParams[i].A, this.ellipseParams[i].B) /
                    Math.max(this.ellipseParams[i].A, this.ellipseParams[i].B)));
        }
        fitness.circleDistortion /= this.ellipseLabel.length;

        logMessage(logFitnessDetails, "Fitness components:");
        for (var fitnessProperty in fitness)
        {
            logMessage(logFitnessDetails, " + " + fitnessProperty +  ": " + fitness[fitnessProperty]);
        }

        return fitness;
    }


    zoneAreaTableBody(returnResults)
    {
        var areaData = this.computeAreasAndBoundingBoxesFromEllipses();
        var veStress = -1;

        // Build up a set of all desired and actual zones.
        var allZones = new Set();
        for (var zone in areaData.zoneAreaProportions)
        {
            allZones.add(zone);
        }
        for (var i = 0; i < this.globalZoneStrings.length; ++i)
        {
            var zone = this.globalZoneStrings[i];
            allZones.add(zone);
        }
        var closureGlobalZoneStrings = this.globalZoneStrings;
        var closureGlobalProportions = this.globalProportions;
        var zonesArray = Array.from(allZones);
        zonesArray.sort(function(a, b) {

            var desiredAreaProportionA = 0;
            var zoneIndex = closureGlobalZoneStrings.indexOf(a);
            if (zoneIndex !== -1)
            {
                desiredAreaProportionA = closureGlobalProportions[zoneIndex];
            }

            var desiredAreaProportionB = 0;
            var zoneIndex = closureGlobalZoneStrings.indexOf(b);
            if (zoneIndex !== -1)
            {
                desiredAreaProportionB = closureGlobalProportions[zoneIndex];
            }

            var result = desiredAreaProportionB - desiredAreaProportionA;
            if (result === 0)
            {
                return a.localeCompare(b);
            }
            return result;
        });

        var tbody = "";
        var csvText = 'Zone,Desired,Actual,Difference\n';


        var totalAreaDifference = 0;
        for (var index in zonesArray)
        {
            var zone = zonesArray[index];

            var extraClass = "";

            var desiredAreaProportion = 0;
            var zoneIndex = this.globalZoneStrings.indexOf(zone);
            if (zoneIndex !== -1)
            {
                desiredAreaProportion = this.globalProportions[zoneIndex];
            }

            var actualAreaProportion = 0;
            if (areaData.zoneAreaProportions.hasOwnProperty(zone))
            {
                actualAreaProportion = areaData.zoneAreaProportions[zone];
            }

            if (desiredAreaProportion === 0)
            {
                extraClass += " unwanted";
            }
            else if (actualAreaProportion === 0)
            {
                extraClass += " missing";
            }

            tbody += "<tr>";

            tbody += '<td class="first' + extraClass + '">' + zone + "</td>";

            tbody +='<td class="other' + extraClass + '">' +
                    (desiredAreaProportion * 100).toFixed(1) +
                    "</td>";

            tbody +='<td class="other' + extraClass + '">' +
                    (actualAreaProportion * 100).toFixed(1) +
                    "</td>";

            var difference = Math.abs(desiredAreaProportion - actualAreaProportion)
            totalAreaDifference += difference;
            tbody +='<td class="other' + extraClass + '">' +
                    (difference * 100).toFixed(2) +
                    "</td>";

            tbody += "</tr>";

            csvText += '"' + zone + '",' + (desiredAreaProportion * 100) + ", " + (actualAreaProportion * 100) + ", " + (difference * 100) + "\n";
        }

        let totalAreaDiff = (totalAreaDifference * 100);

        tbody += "<tr>";

        tbody += "<td><b>Total area diff:</b></td>";

        tbody +='<td colspan="3" class="other">' +
                totalAreaDiff.toFixed(4) +
                "</td>";

        tbody += "</tr>";

        csvText += 'Total:,,,' + totalAreaDiff + '\n';

        // For comparison compare against venneuler().
        if (typeof VennEulerAreas === "function")
        {
            let veAreas = new VennEulerAreas(this.ellipseLabel,
                    this.globalZoneStrings, this.globalProportions);
            veStress = veAreas.vennEulerAreasAndStress(this.ellipseParams);

            // Venneuler stress:
            tbody += "<tr>";
            tbody += "<td><b>Stress:</b></td>";
            tbody +='<td colspan="3" class="other">' +
                    veStress.toFixed(4) +
                    "</td>";
            tbody += "</tr>";
        }

        this.maxTotalAreaDiff = Math.max(this.maxTotalAreaDiff, totalAreaDiff);
        if (totalAreaDiff < this.maxTotalAreaDiff)
        {
            const PROGRESS_LENGTH = 2000;
            let progressValue = (1 - (totalAreaDiff / this.maxTotalAreaDiff)) * PROGRESS_LENGTH;

            tbody += '<tr class="progressRow">';
            tbody += '<td colspan="4">';
            tbody += '<progress id="optimizerProgress" style="width: 100%;" max="'+ PROGRESS_LENGTH + '" value="' + progressValue + '"></progress>';
            tbody += "</td>";
            tbody += "</tr>";

        }

        if (returnResults)
        {
            return {
                tableBody: tbody,
                csvText: csvText,
                veStress: veStress,
                totalAreaDiff: totalAreaDiff
            };
        }

        return tbody
    }

}
