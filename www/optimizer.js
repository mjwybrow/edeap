///
// Author:  Fadi Dib <deeb.f@gust.edu.kw>
//

const PI = Math.PI;

var ellipseEquivilenceSet = [];
var duplicatedEllipseIndexes = [];
// if set fo an index, indicates the number of this ellipse as a duplicate.
var ellipseDuplication = [];

var move = [];   // array to track the fitness value computed at each move
var currentFitness; // the value of the current computed fitness

// values used in the movements of ellipse
const centerShift = 0.13; // previous value = 0.035  value of shifting the center point of the ellipse up, down, left, right
const radiusLength = 0.03; // previous value = 0.005  value of increasing/decreasing the length of the major/minor axis of the ellipse
const angle = 0.1; // previous value = 0.02 value of angle rotation

// Simulated annealing parameters
var temp = 0.75; // annealing temperature
var coolDown = 0.8; // annealing cooling down
var maxIterations = 45; // annealing process maximum number of iterations
var tempIterations = 15; // number of annealing iterations at each temperature

var currentAnnealingIteration = 0;
var currentTemperatureIteration = 0;

var animationDelay = 0; // In msec

var optimizerUsesSetTimeout = true;
var animateOptimizer = true; // if false, does not display till end.  Implies optimizerUsesSetTimeout = true.

let zoomToFitAtEachStep = true;  // If animating, keep adjusting zoom.

var changeSearchSpace = false; // a variable which indicates whether the optimizer should change its search space or not
var areas = null;

// Unlisted weights are assumed to be 1.
var weights = {
    zoneAreaDifference: 16.35,
    unwantedZone: 0.1,
    splitZone: 0,
    missingOneLabelZone: 27.6,
    missingTwoOrMoreLabelZone: 12.35,
    unwantedExpandedOverlap: 3.6,
    circleDistortion: 0
};

const HILL_CLIMBING = 1;
const SIMULATED_ANNEALING = 2;

var OPTIMSER = HILL_CLIMBING;

var maxMeasures = {}; // to save the maximum value of a measure in a history of values of each measure to be used in the normalization process

var HCEvalSolutions = 0; // a counter that stores number of solutions evaluated by Hill Climbing optimizer
var SAEvalSolutions = 0; // a counter that stores number of solutions evaluated by Simulated Annealing optimizer

var completionHandlerFunc = null;

// the optimization method

function optimize(completionHandler)
{
    ellipseMap = new Map();

    completionHandlerFunc = completionHandler;
	changeSearchSpace = false;  // optimizer in first stage of search space
    maxMeasures = {}; // to save the maximum value of a meausure in a history of values of each measure to be used in the normalization process
    move = [];
	HCEvalSolutions = 0; // initialize number of evaluated solutions (by hill climber) to zero
	SAEvalSolutions = 0; // initialize number of evaluated solutions (by simulated annealing) to zero
    areas = new EdeapAreas();
    currentAnnealingIteration = 0;
    currentTemperatureIteration = 0;


    currentFitness = computeFitness();
    for (var elp = 0; elp < ellipseLabel.length; elp++)  // for each ellipse
    {
        printEllipseInfo(elp);
    }
    logMessage(logOptimizerStep, "Fitness %s", currentFitness);

	if(animateOptimizer || optimizerUsesSetTimeout)
	{
		setTimeout(function(){optimizeStep(OPTIMSER)}, animationDelay);
	}
	else
	{
		optimizeStep(OPTIMSER);
	}

}

// Once the optimizer has finished, animate the progress, scaling and
// translation over half a second.
let completionAnimationSteps = 13.0;
let completionAnimationDelay = 500 / completionAnimationSteps;

// Variables to track animation steps.
let completionAnimationStepN = 0;
let scalingAnimationStep = 0;
let translateXAnimationStep = 0;
let translateYAnimationStep = 0;
let progressAnimationStep = 0;

function optimizeStep(opt)
{
	var bestMoveFitness;
    var bestMoveEllipse;
    var bestMove;

    if (opt === HILL_CLIMBING)
    {
	   bestMoveFitness = currentFitness;
	   bestMoveEllipse = -1;
       for (var elp = 0; elp < ellipseLabel.length; elp++)  // for each ellipse
       {
           if (duplicatedEllipseIndexes.includes(elp))
           {
               // Skip duplicated ellipses.
               continue;
           }

           // For each ellipse check for best move.
           logMessage(logOptimizerStep, ellipseLabel[elp]);
           possibleFitness = selectBestCostMove(elp);  // select the best move for each ellipse and saves its ID in var selectedMove and it also returns the fitness value at that move
           logMessage(logOptimizerStep, "currentFitness %s", possibleFitness);
           if (possibleFitness < bestMoveFitness && possibleFitness >= 0)
           {
               // There is an improvement, remember it.
               bestMove = selectedMove;
               bestMoveEllipse = elp;
               bestMoveFitness = possibleFitness;
           }
       }

       if (bestMoveEllipse >= 0)
       {
		   changeSearchSpace = false; // use first search space
           // There is a move better than the current fitness.
           currentFitness = bestMoveFitness;
           applyMove(bestMoveEllipse, bestMove);
	       if(animateOptimizer)
	       {
               if (zoomToFitAtEachStep)
               {
                   var transformation = findTransformationToFit(canvasWidth, canvasHeight);
                   scaling = transformation.scaling;
                   translateX = transformation.translateX;
                   translateY = transformation.translateY;
               }

		      logMessage(logOptimizerStep, "Fitness %s", currentFitness);
			  printEllipseInfo(bestMoveEllipse);
			  document.getElementById('ellipsesSVG').innerHTML = generateSVG(canvasWidth, canvasHeight, false, false, translateX, translateY, scaling);

			  let tbody = areas.zoneAreaTableBody();
              document.getElementById('areaTableBody').innerHTML = tbody;
		   }

           // Only continue if there were improvements.
		   if(animateOptimizer || optimizerUsesSetTimeout)
		   {
		 	   setTimeout(function(){optimizeStep(opt)}, animationDelay);
		   }
	   	   else
		   {
			   optimizeStep(opt);
		   }
           return;
       }
       else
       {
           /* Disable this:
		  if (!changeSearchSpace) // if the optimizer was searching in the first search space, switch to the second.
		  {
			  changeSearchSpace = true;
			  if(animateOptimizer || optimizerUsesSetTimeout)
			  {
			  	   setTimeout(function(){optimizeStep(OPTIMSER)}, animationDelay);
			  }
			  else
			  {
			  	   optimizeStep(OPTIMSER);
		      }
              return;
		  }
          */
	   }
   }
   else if (opt === SIMULATED_ANNEALING)
   {
       if (currentTemperatureIteration >= tempIterations)
       {
           currentAnnealingIteration++;
           currentTemperatureIteration = 0;

           temp = temp * coolDown;
       }

       if (currentAnnealingIteration < maxIterations &&
           currentTemperatureIteration < tempIterations)
       {
           bestMoveFitness = currentFitness;
           bestMoveEllipse = -1;
           var found = false;  // if a solution that satisfies the annealing criteria is found
           for (var elp = 0; elp < ellipseLabel.length && !found; elp++)  // for each ellipse
           {
               if (duplicatedEllipseIndexes.includes(elp))
               {
                   // Skip duplicated ellipses.
                   continue;
               }

               // For each ellipse check for best move.
               logMessage(logOptimizerStep, ellipseLabel[elp]);
               possibleFitness = selectRandomMove(elp);  // select a random move (between 1 and 10) for each ellipse and saves its ID in var selectedMove and it also returns the fitness value at that move
               logMessage(logOptimizerStep, "currentFitness %s", possibleFitness);
               var fitnessDifference = possibleFitness - bestMoveFitness; // difference between the bestFitness so far and the fitness of the selected random move
               var SAAccept = Math.exp(-1 * fitnessDifference / temp); // Simulated annealing acceptance function
               var SARand = Math.random();  // a random number between [0,1)
               if (fitnessDifference < 0 || (SAAccept <= 1 && SARand < SAAccept))  // solution acceptance criteria
               {
                   // move to a solution that satisfies the acceptance criteria of SA
                   bestMove = selectedMove;
                   bestMoveEllipse = elp;
                   bestMoveFitness = possibleFitness;
                   found = true;
               }
           }
           if (found) // if a move is taken
           {
               changeSearchSpace = false; // first search space
               currentFitness = bestMoveFitness;
               applyMove(bestMoveEllipse, bestMove);
               if (animateOptimizer)
               {
                   logMessage(logOptimizerStep, "Fitness %s", currentFitness);
                   printEllipseInfo(bestMoveEllipse);
                   document.getElementById('ellipsesSVG').innerHTML = generateSVG(canvasWidth, canvasHeight, false, false, translateX, translateY, scaling, areas);
                   document.getElementById('areaTableBody').innerHTML = areas.zoneAreaTableBody();
               }
            } // if no move is taken
            else if(!changeSearchSpace) // switch to second search space
            {
                changeSearchSpace = true;
            }

            currentTemperatureIteration++;

            if (animateOptimizer || optimizerUsesSetTimeout)
            {
                setTimeout(function(){optimizeStep(opt)}, animationDelay);
            }
            else
            {
                optimizeStep(opt);
            }
            return;
        }
    }

    // Optimizer finishes execution here
    globalFinalFitness = currentFitness;
    var transformation = findTransformationToFit(canvasWidth, canvasHeight);
    let progress = document.getElementById("optimizerProgress");

    if (!zoomToFitAtEachStep)
    {
        if (animateOptimizer)
        {
            // Setup completion animation.
            scalingAnimationStep = (transformation.scaling - scaling) / completionAnimationSteps;
            translateXAnimationStep = (transformation.translateX - translateX) / completionAnimationSteps;
            translateYAnimationStep = (transformation.translateY - translateY) / completionAnimationSteps;
            progressAnimationStep = (progress.max - progress.value) / completionAnimationSteps ;
            completionAnimationStepN = 0;
            setTimeout(completionAnimationStep, completionAnimationDelay);
            return;
        }
        else
        {
            scaling += scalingAnimationStep;
            translateX += translateXAnimationStep;
            translateY += translateYAnimationStep;
        }
    }

    var svgText = generateSVG(canvasWidth, canvasHeight, showSetLabels, showIntersectionValues, translateX, translateY, scaling);
    document.getElementById('ellipsesSVG').innerHTML = svgText;

    if (animateOptimizer && progress)
    {
        progress.value = progress.max;
    }
    logMessage(logOptimizerStep, "optimizer finished");

    if (typeof completionHandlerFunc === 'function')
    {
        completionHandlerFunc();
    }
}

function completionAnimationStep() {
    let progress = document.getElementById("optimizerProgress");

    if (completionAnimationStepN === completionAnimationSteps) {
        progress.value = progress.max;
        logMessage(logOptimizerStep, "optimizer finished");

        if (typeof completionHandlerFunc === 'function')
        {
            completionHandlerFunc();
        }

        return;
    }

    completionAnimationStepN++;

    scaling += scalingAnimationStep;
    translateX += translateXAnimationStep;
    translateY += translateYAnimationStep;
    progress.value = progress.value + progressAnimationStep;

    var svgText = generateSVG(canvasWidth, canvasHeight, showSetLabels, showIntersectionValues, translateX, translateY, scaling);
    document.getElementById('ellipsesSVG').innerHTML = svgText;

    setTimeout(completionAnimationStep, completionAnimationDelay);
}

function printEllipseInfo(elp)
{
	logMessage(logOptimizerStep, "Label = %s X = %s Y = %s A = %s B = %s R = %s",
            ellipseLabel[elp],ellipseParams[elp].X, ellipseParams[elp].Y,
            ellipseParams[elp].A, ellipseParams[elp].B,
            ellipseParams[elp].R);
}

// This method takes ellipse number (elp) as a parameter, and checks which move gives the best fitness. it returns the fitness value along with the ID
// of the move returned in the global variable selectedMove

function selectBestCostMove(elp)  // select the best move of a given ellipse (elp)
{
    move = [];
    move[1] = centerX(elp, centerShift);   // use positive and negative values to move right and left
    move[2] = centerX(elp, -1 * centerShift);
    move[3] = centerY(elp, centerShift);   // use positive and negative values to move up and down
    move[4] = centerY(elp, -1 * centerShift);
    move[5] = radiusA(elp, radiusLength);  // use positive and negative values to increase/decrease the length of the A radius
    move[6] = radiusA(elp, -1 * radiusLength);
    // Only test rotation if the ellipse is not a circle.
    if (ellipseParams[elp].A !== ellipseParams[elp].B)
    {
    	move[7] = rotateEllipse(elp, angle);
    	move[8] = rotateEllipse(elp, -1 * angle);
    }

	if (changeSearchSpace)  // second search space
	{
		move[9] = RadiusAndRotateA(elp, radiusLength, angle); // increase A positive rotation
		move[10] = RadiusAndRotateA(elp, -1 * radiusLength, angle); // decrease A positive rotation
		move[11] = RadiusAndRotateA(elp, radiusLength, -1 * angle); // increase A positive rotation
		move[12] = RadiusAndRotateA(elp, -1 * radiusLength, -1 * angle); // decrease A negative rotation
	}
    return costMinMove();
}

function costMinMove()
{
	 var minimumCostMoveID = 1; // 1 is the id of the first move
	 for(var i=2; i<=move.length; i++) // find the ID (number of the move that gives the minimum fitness
	     if(move[i] < move[minimumCostMoveID])
	       minimumCostMoveID = i;
     selectedMove = minimumCostMoveID; // index of move with minimum cost
     return move[minimumCostMoveID];  // return the cost at that move
}

// apply the move with ID (number) = index of the ellipse number elp
function applyMove(elp, index)
{
	switch (index)
	{
		case 1: changeCenterX(elp, centerShift);
		        break;
		case 2: changeCenterX(elp, -1 * centerShift);
		        break;
		case 3: changeCenterY(elp, centerShift);
		        break;
		case 4: changeCenterY(elp, -1 * centerShift);
		        break;
		case 5: changeRadiusA(elp, radiusLength);
		        break;
		case 6: changeRadiusA(elp, -1 * radiusLength);
		        break;
    	case 7: changeRotation(elp, angle);
    	   		break;
    	case 8: changeRotation(elp, -1 * angle);
    	         break;
		case 9: changeRadiusAndRotationA(elp, radiusLength, angle);
				 break;
		case 10: changeRadiusAndRotationA(elp, -1 * radiusLength, angle);
			     break;
		case 11: changeRadiusAndRotationA(elp, radiusLength, -1 * angle);
			     break;
		case 12: changeRadiusAndRotationA(elp, -1 * radiusLength, -1 * angle);
			  	 break;
	}
}

// This method is used for Simulated annealing optimizer. It takes ellipse number (elp) as a parameter, and selects a random move (between 1 and 10).
// it returns the fitness value along with the ID of the move returned in the global variable selectedMove

function selectRandomMove(elp)  // select the best move of a given ellipse (elp)
{
	var fit;
	var randIndex;

	if (!changeSearchSpace) // first search space
		randIndex = 1 + parseInt(Math.random() * ((8 - 1) + 1));  // generate a random number between 1 and 8
	else  // second search space
	    randIndex = 1 + parseInt(Math.random() * ((12 - 1) + 1));  // generate a random number between 1 and 12

	switch (randIndex)
	{
		case 1: fit = centerX(elp, centerShift);
				break;
	    case 2: fit = centerX(elp, -1 * centerShift);
			    break;
		case 3: fit = centerY(elp, centerShift);
				break;
		case 4: fit = centerY(elp, -1 * centerShift);
				break;
		case 5: fit = radiusA(elp, radiusLength);
		        break;
		case 6: fit = radiusA(elp, -1 * radiusLength);
		        break;
		case 7: fit = rotateEllipse(elp, angle);
		   	    break;
	    case 8: fit = rotateEllipse(elp, -1 * angle);
	             break;
		case 9: fit = RadiusAndRotateA(elp, radiusLength, angle);
		   		 break;
	    case 10: fit = RadiusAndRotateA(elp, -1 * radiusLength, angle);
		    	 break;
	    case 11: fit = RadiusAndRotateA(elp, radiusLength, -1 * angle);
			     break;
	    case 12: fit = RadiusAndRotateA(elp, -1 * radiusLength, -1 * angle);
	    	     break;
	}
    selectedMove = randIndex;
    return fit;
}

function computeFitness()
{
	HCEvalSolutions++; // when computeFitness function is called, that means a solution has been evaluated (increase counter of evaluated solutions by 1) Hill Climbing
    SAEvalSolutions++; // Simulated annealing
    var normalizedMeasures = {};
    var fitnessComponents = areas.computeFitnessComponents();  // get the measures (criteria)

    var fitness = 0;

    logMessage(logOptimizerStep, "- move[" + (move.length + 1) + "]");
    var fitnessComponentN = 0;
    for (var component in fitnessComponents)
    {
        if (maxMeasures.hasOwnProperty(component) === false)
        {
            // track the maximum value computed so far for each component to be used in the normalisation process.
            maxMeasures[component] = [];
            maxMeasures[component][0] = 0;
        }

        // the value of the measure before normalization
        var m = fitnessComponents[component];
        // the value of the measure after normalization
        m = normalizeMeasure(m, maxMeasures[component]);
        logMessage(logOptimizerStep, "    " + component + " = " + m);

        normalizedMeasures[component] = m;  // store the normalized measures to use in fitness computation after equalizing their effect

        fitnessComponentN++;
    }

    // compute the total fitness value after equalizing the effect of each measure and applying a weight for each measure
    for (var component in fitnessComponents)
    {
        var weight = 1;
        if (weights.hasOwnProperty(component))
        {
            weight = weights[component];
        }

        fitness += (weight * normalizedMeasures[component]);
    }
    // Divide by the total number of measures.
    fitness = fitness / fitnessComponentN;

    logMessage(logOptimizerStep, "  Fitness: " + fitness);

    return fitness;
}

// this function equalizes the effect of each measure. For each measure i, it computes the product of all the other measures and multiply it by measure i
// for example: if m1 = 1, m2 = 10, m3 = 1000, to equalize the effect of each measure m1 is multiplied by 10 * 1000, m2 is multiplied by 1 * 1000, and m3
// is multiplied by 1 * 10 ... this is just an example. in our system, all the measures are normalized before this step is performed.

function equalizeEffect(i, normalizedMeasures)
{
	if (normalizedMeasures[i] != 0)
	{
	   var effectProduct = 1;
	   for(var j in normalizedMeasures)
       {
	   	  if (i != j && normalizedMeasures[j] != 0)
		     effectProduct *= normalizedMeasures[j];
	   }
  	   return effectProduct;
   }
   return 0;
}


function fixNumberPrecision(value)
{
    return Number(parseFloat(value).toPrecision(13));
}

// computes the fitness value when we move the center point horizontally

function centerX(elp, centerShift)
{
    let oldX = ellipseParams[elp].X;
    ellipseParams[elp].X = fixNumberPrecision(oldX + centerShift);
    var fit = computeFitness();
    logMessage(logOptimizerChoice, "fit %s", fit);
    ellipseParams[elp].X = oldX; // to return back to the state before the change
    return fit;
}

// computes the fitness value when we move the center point vertically

function centerY(elp, centerShift)
{
    let oldY = ellipseParams[elp].Y;
     ellipseParams[elp].Y = fixNumberPrecision(oldY + centerShift);
	 var fit = computeFitness();
	 logMessage(logOptimizerChoice, "fit %s", fit);
	 ellipseParams[elp].Y = oldY; // to return back to the state before the change
     return fit;
}

// computes the fitness value when we increase/decrease the radius A

function radiusA(elp, radiusLength)
{
    var oldA = ellipseParams[elp].A;
    var oldB = ellipseParams[elp].B;

    if (ellipseParams[elp].A + radiusLength <= 0)
    {
        return Math.MAX_VALUE;
    }

    ellipseParams[elp].A += radiusLength;
    ellipseParams[elp].B = ellipseArea[elp] / (Math.PI * ellipseParams[elp].A);
    var fit = computeFitness();
	logMessage(logOptimizerChoice, "fit %s", fit);

    ellipseParams[elp].A = oldA;
    ellipseParams[elp].B = oldB;

    return fit;
}

// rotates the ellipse (if not a circle) by angle r

function rotateEllipse(elp, r)
{
    var oldR = ellipseParams[elp].R;
    ellipseParams[elp].R += r;
    ellipseParams[elp].R = (ellipseParams[elp].R + PI) % PI; // Ensure R is between 0 and PI.
    var fit = computeFitness();
    logMessage(logOptimizerChoice, "fit %s", fit);
    ellipseParams[elp].R = oldR;
    return fit;
}

// increase/decrease radius A and rotate at the same time

function RadiusAndRotateA(elp, radiusLength, angle)
{
    var oldA = ellipseParams[elp].A;
    var oldB = ellipseParams[elp].B;
    var oldR = ellipseParams[elp].R;

    ellipseParams[elp].A += radiusLength;
    ellipseParams[elp].B = ellipseArea[elp] / (Math.PI * ellipseParams[elp].A);
    ellipseParams[elp].R += angle;
    ellipseParams[elp].R = (ellipseParams[elp].R + PI) % PI; // Ensure R is between 0 and PI.
	var fit = computeFitness();
    logMessage(logOptimizerChoice, "fit %s", fit);

    ellipseParams[elp].A = oldA;
    ellipseParams[elp].B = oldB;
    ellipseParams[elp].R = oldR;
    return fit;
}

// apply the move on the center point of the ellipse elp horizontally
function changeCenterX(elp, centerShift)
{
    let oldX = ellipseParams[elp].X;
    ellipseParams[elp].X = fixNumberPrecision(oldX + centerShift);
}

// apply the move on the center point of the ellipse elp vertically
function changeCenterY(elp, centerShift)
{
    let oldY = ellipseParams[elp].Y;
     ellipseParams[elp].Y = fixNumberPrecision(oldY + centerShift);
}

// apply the move by increasing/decreasing radius A of ellipse elp
function changeRadiusA(elp, radiusLength)
{
    ellipseParams[elp].A += radiusLength;
    ellipseParams[elp].B = ellipseArea[elp] / (Math.PI * ellipseParams[elp].A);
}

// apply rotation
function changeRotation(elp, angle)
{
    ellipseParams[elp].R += angle;
    ellipseParams[elp].R = (ellipseParams[elp].R + PI) % PI; // Ensure R is between 0 and PI.
}

// apply radius A increase/decrease along with rotation

function changeRadiusAndRotationA (elp, radiusLength, angle)
{
	changeRadiusA(elp, radiusLength);
	changeRotation(elp, angle);
}



/*********** Normalization starts here *******************/

var safetyValue = 0.000000000001;     // a safety value to ensure that the normalized value will remain within the range so that the returned value will always be between 0 and 1
				                      // this is a technique which is used whenever the measure has no upper bound.

// a function that takes the value which we need to normalize measureValueBeforeNorm and the maximum value of the measure computed so far
// we will get the maximum value we computed so far and we add a safety value to it
// to ensure that we don't exceed the actual upper bound (which is unknown for us)
function normalizeMeasure(measureValueBeforeNorm, maxMeasure)
{
	var mNorm;
	if (measureValueBeforeNorm > maxMeasure[0])
	   maxMeasure[0] = measureValueBeforeNorm;    // update the maximum value of the measure if the new value is greater than the current max value
	mNorm = measureValueBeforeNorm / (maxMeasure[0]+safetyValue); // normalized
    return mNorm;
}
