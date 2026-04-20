FROM public.ecr.aws/lambda/python:3.11

RUN dnf install -y libgomp && dnf clean all

COPY requirements-ml.txt ${LAMBDA_TASK_ROOT}/requirements-ml.txt
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements-ml.txt --target ${LAMBDA_TASK_ROOT}

COPY scripts ${LAMBDA_TASK_ROOT}/scripts
COPY src/lib/data/sealed-ml ${LAMBDA_TASK_ROOT}/src/lib/data/sealed-ml

CMD ["scripts.retrain_sealed_ml.lambda_handler"]

