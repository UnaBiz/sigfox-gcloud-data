#!/bin/bash

name=sendToDatabase
localpath=.
trigger=--trigger-topic
topic=sigfox.types.${name}
export options="--memory=1024MB --timeout=500"

./scripts/functiondeploy.sh ${name}   ${localpath} ${trigger} ${topic}

# To deploy a second instance, uncomment this:
# ./scripts/functiondeploy.sh ${name}2  ${localpath} ${trigger} ${topic}
